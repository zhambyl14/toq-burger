-- Automatic courier dispatch (owner decision 2026-11-04):
--  * couriers no longer choose orders: a DELIVERY order is auto-assigned when it enters PREPARING
--    (fallback: ACCEPTED/READY retries), so the courier arrives while it is being finished;
--  * batching: a courier still heading to / waiting at a branch may receive more orders from the SAME branch
--    when their ready/prep times are within N minutes and the drop points are close OR in the same direction;
--  * all thresholds live in dispatch_settings (admin-editable);
--  * a courier with active orders cannot go offline; back office can see and reassign couriers.

create table public.dispatch_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  batch_enabled boolean not null default true,
  max_batch_size smallint not null default 3 check (max_batch_size between 1 and 10),
  ready_window_min smallint not null default 3 check (ready_window_min between 0 and 60),
  max_drop_distance_km numeric(5,2) not null default 2.5 check (max_drop_distance_km >= 0),
  max_bearing_diff_deg smallint not null default 30 check (max_bearing_diff_deg between 0 and 180),
  location_max_age_min smallint not null default 15 check (location_max_age_min between 1 and 240),
  updated_at timestamptz not null default now()
);
insert into public.dispatch_settings(id) values (1);
alter table public.dispatch_settings enable row level security;
create policy dispatch_settings_read on public.dispatch_settings for select to authenticated using (true);
create policy dispatch_settings_admin on public.dispatch_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, update on public.dispatch_settings to authenticated;
grant all on public.dispatch_settings to service_role;
create trigger trg_audit_dispatch_settings after update on public.dispatch_settings for each row execute function public.audit_row();

-- history events: add COURIER_ASSIGNED
alter table public.order_status_history drop constraint if exists order_status_history_event_check;
alter table public.order_status_history add constraint order_status_history_event_check
  check (event in ('STATUS','COURIER_ASSIGNED','COURIER_REJECTED','COURIER_RELEASED','SUPPORT_REPLY','NOTE'));

create or replace function public.system_order_event(p_order uuid, p_event text, p_note text) returns void
language sql security definer set search_path = '' as $$
  insert into public.order_status_history(order_id, to_status, actor_id, actor_name, actor_role, event, note)
  values (p_order, null, null, 'Система', 'SYSTEM', p_event, left(p_note, 500))
$$;
revoke execute on function public.system_order_event(uuid, text, text) from public, anon, authenticated;

-- ---------- geometry helpers ----------
create or replace function public.bearing_deg(lat1 float8, lon1 float8, lat2 float8, lon2 float8) returns float8
language sql immutable as $$
  select (((degrees(atan2(
    sin(radians(lon2 - lon1)) * cos(radians(lat2)),
    cos(radians(lat1)) * sin(radians(lat2)) - sin(radians(lat1)) * cos(radians(lat2)) * cos(radians(lon2 - lon1))
  )) + 360)::numeric % 360)::float8
$$;
create or replace function public.angle_diff(a float8, b float8) returns float8
language sql immutable as $$ select least(abs(a - b), 360 - abs(a - b)) $$;

-- orders a courier is responsible for and has not delivered yet
create or replace function public.courier_active_count(p_courier uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.orders
  where courier_id = p_courier and status in ('ACCEPTED','PREPARING','READY','COURIER_ASSIGNED','PICKED_UP','ON_THE_WAY')
$$;

-- ---------- the dispatcher ----------
create or replace function public.dispatch_order(p_order uuid, p_exclude uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s public.dispatch_settings;
  o public.orders;
  b public.branches;
  v_ref timestamptz;
  v_courier uuid;
  v_batch boolean := false;
  v_name text;
begin
  perform pg_advisory_xact_lock(hashtext('tok-dispatch'));
  select * into s from public.dispatch_settings where id = 1;
  if not found or not s.enabled then return null; end if;
  select * into o from public.orders where id = p_order for update;
  if not found or o.mode <> 'DELIVERY' or o.courier_id is not null
     or o.status not in ('ACCEPTED','PREPARING','READY') or o.lat is null then
    return null;
  end if;
  select * into b from public.branches where id = o.branch_id;
  v_ref := coalesce(o.ready_at, o.preparing_at, now());

  -- 1) batch onto a courier who is still going to / waiting at the same branch
  if s.batch_enabled and s.max_batch_size > 1 then
    select c.user_id into v_courier
    from public.couriers c
    where c.is_active and c.is_online and c.user_id is distinct from p_exclude
      and exists (select 1 from public.orders x where x.courier_id = c.user_id
                  and x.status in ('ACCEPTED','PREPARING','READY','COURIER_ASSIGNED'))
      -- not delivering yet, all current orders from this branch
      and not exists (select 1 from public.orders x where x.courier_id = c.user_id
                      and x.status in ('PICKED_UP','ON_THE_WAY'))
      and not exists (select 1 from public.orders x where x.courier_id = c.user_id
                      and x.status in ('ACCEPTED','PREPARING','READY','COURIER_ASSIGNED') and x.branch_id <> o.branch_id)
      and public.courier_active_count(c.user_id) < s.max_batch_size
      -- every current order: ready times close AND (drops close OR same direction from the branch)
      and not exists (
        select 1 from public.orders x
        where x.courier_id = c.user_id and x.status in ('ACCEPTED','PREPARING','READY','COURIER_ASSIGNED')
          and (
            abs(extract(epoch from (coalesce(x.ready_at, x.preparing_at, x.created_at) - v_ref))) / 60 > s.ready_window_min
            or (
              public.haversine_km(x.lat, x.lon, o.lat, o.lon) > s.max_drop_distance_km
              and public.angle_diff(public.bearing_deg(b.lat, b.lon, x.lat, x.lon), public.bearing_deg(b.lat, b.lon, o.lat, o.lon)) > s.max_bearing_diff_deg
            )
          )
      )
    order by public.courier_active_count(c.user_id),
      (select min(public.haversine_km(x.lat, x.lon, o.lat, o.lon)) from public.orders x
        where x.courier_id = c.user_id and x.status in ('ACCEPTED','PREPARING','READY','COURIER_ASSIGNED'))
    limit 1;
    v_batch := v_courier is not null;
  end if;

  -- 2) a free courier: nearest by fresh GPS to the branch, otherwise the one idle the longest
  if v_courier is null then
    select c.user_id into v_courier
    from public.couriers c
    left join lateral (
      select l.lat, l.lon from public.courier_locations l
      where l.courier_id = c.user_id and l.created_at > now() - make_interval(mins => s.location_max_age_min)
      order by l.created_at desc limit 1) loc on true
    left join lateral (
      select max(x.delivered_at) last_done from public.orders x where x.courier_id = c.user_id) h on true
    where c.is_active and c.is_online and c.user_id is distinct from p_exclude
      and public.courier_active_count(c.user_id) = 0
    order by case when loc.lat is null or b.lat is null then null else public.haversine_km(loc.lat, loc.lon, b.lat, b.lon) end nulls last,
      h.last_done nulls first
    limit 1;
  end if;

  if v_courier is null then return null; end if;

  update public.orders set courier_id = v_courier where id = o.id and courier_id is null;
  insert into public.courier_assignments(order_id, courier_id, status, responded_at)
  values (o.id, v_courier, 'ACCEPTED', now());
  v_name := public.person_name(v_courier);
  perform public.system_order_event(o.id, 'COURIER_ASSIGNED',
    'Автоназначение: ' || v_name || case when v_batch then ' (несколько заказов по пути)' else '' end);
  return v_courier;
end $$;

-- assign every waiting order (oldest first); safe to call any time
create or replace function public.dispatch_pending() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select id from public.orders
           where mode = 'DELIVERY' and courier_id is null and status in ('PREPARING','READY')
           order by coalesce(preparing_at, created_at)
           limit 50 loop
    if public.dispatch_order(r.id) is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;

revoke execute on function public.dispatch_order(uuid, uuid), public.dispatch_pending(), public.courier_active_count(uuid)
  from public, anon, authenticated;

-- staff-callable wrapper (courier app on load / back office "retry")
create or replace function public.request_dispatch() returns int
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.has_role('COURIER') or public.is_backoffice()
          or exists (select 1 from public.staff_branch_ids())) then
    raise exception 'FORBIDDEN';
  end if;
  return public.dispatch_pending();
end $$;
grant execute on function public.request_dispatch() to authenticated;

-- ---------- triggers ----------
create or replace function public.orders_dispatch_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('tok.no_dispatch', true), '') = '1' or new.status is not distinct from old.status then
    return null;
  end if;
  if new.mode = 'DELIVERY' and new.courier_id is null and new.status in ('PREPARING','READY') then
    perform public.dispatch_order(new.id);
  end if;
  -- a courier freed up => give them waiting work
  if old.courier_id is not null and new.status in ('DELIVERED','CANCELLED') then
    perform public.dispatch_pending();
  end if;
  return null;
end $$;
create trigger trg_orders_dispatch after update of status on public.orders
  for each row execute function public.orders_dispatch_trigger();

create or replace function public.couriers_online_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.is_online and not new.is_online and public.courier_active_count(new.user_id) > 0 then
    raise exception 'HAS_ACTIVE_ORDERS';
  end if;
  return new;
end $$;
create trigger trg_couriers_online_guard before update of is_online on public.couriers
  for each row execute function public.couriers_online_guard();

create or replace function public.couriers_online_dispatch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_online and not old.is_online and new.is_active then perform public.dispatch_pending(); end if;
  return null;
end $$;
create trigger trg_couriers_online_dispatch after update of is_online on public.couriers
  for each row execute function public.couriers_online_dispatch();

-- ---------- lifecycle: courier picks up straight from READY ----------
create or replace function public.order_transition_allowed(f public.order_status, t public.order_status, m public.fulfillment_mode)
returns boolean language sql immutable as $$
  select case
    when t = 'CANCELLED' then f in ('PENDING','ACCEPTED','PREPARING','READY','COURIER_ASSIGNED')
    when f = 'PENDING' then t = 'ACCEPTED'
    when f = 'ACCEPTED' then t = 'PREPARING'
    when f = 'PREPARING' then t = 'READY'
    when f = 'READY' then (m = 'PICKUP' and t = 'DELIVERED') or (m = 'DELIVERY' and t in ('COURIER_ASSIGNED','PICKED_UP'))
    when f = 'COURIER_ASSIGNED' then t = 'PICKED_UP'
    when f = 'PICKED_UP' then t = 'ON_THE_WAY'
    when f = 'ON_THE_WAY' then t = 'DELIVERED'
    else false end
$$;

-- ---------- back office: reassign / release ----------
create or replace function public.reassign_courier(p_order uuid, p_courier uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare o public.orders; v_old uuid; v_new uuid;
begin
  if not public.is_backoffice() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if o.mode <> 'DELIVERY' or o.status not in ('ACCEPTED','PREPARING','READY','COURIER_ASSIGNED') then
    raise exception 'INVALID_TRANSITION';
  end if;
  if p_courier is not null and not exists (select 1 from public.couriers where user_id = p_courier and is_active) then
    raise exception 'COURIER_INACTIVE';
  end if;
  v_old := o.courier_id;
  update public.courier_assignments set status = 'CANCELLED', responded_at = now()
    where order_id = p_order and status = 'ACCEPTED';
  perform set_config('tok.no_dispatch', '1', true); -- we dispatch explicitly below
  update public.orders set courier_id = null,
    status = case when status = 'COURIER_ASSIGNED' then 'READY'::public.order_status else status end
  where id = p_order;
  perform set_config('tok.no_dispatch', '', true);
  if v_old is not null then
    perform public.add_order_event(p_order, 'COURIER_RELEASED', 'Снят курьер ' || public.person_name(v_old));
  end if;
  if p_courier is not null then
    update public.orders set courier_id = p_courier where id = p_order;
    insert into public.courier_assignments(order_id, courier_id, status, responded_at) values (p_order, p_courier, 'ACCEPTED', now());
    perform public.add_order_event(p_order, 'COURIER_ASSIGNED', 'Назначен вручную: ' || public.person_name(p_courier));
    v_new := p_courier;
  else
    v_new := public.dispatch_order(p_order, v_old);
  end if;
  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'reassign_courier', 'orders', p_order::text, jsonb_build_object('from', v_old, 'to', v_new));
  return v_new;
end $$;
grant execute on function public.reassign_courier(uuid, uuid) to authenticated;

-- kitchen/back office "courier did not come": release before pickup and auto-dispatch to someone else
create or replace function public.release_courier(p_order uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders; v_name text;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_backoffice() or o.branch_id in (select public.staff_branch_ids())) then raise exception 'FORBIDDEN'; end if;
  if o.courier_id is null or o.status not in ('ACCEPTED','PREPARING','READY','COURIER_ASSIGNED') then raise exception 'INVALID_TRANSITION'; end if;
  v_name := public.person_name(o.courier_id);
  update public.courier_assignments set status = 'CANCELLED', responded_at = now()
    where order_id = p_order and status = 'ACCEPTED';
  perform set_config('tok.no_dispatch', '1', true); -- we dispatch explicitly below
  update public.orders set courier_id = null,
    status = case when status = 'COURIER_ASSIGNED' then 'READY'::public.order_status else status end
  where id = p_order;
  perform set_config('tok.no_dispatch', '', true);
  perform public.add_order_event(p_order, 'COURIER_RELEASED', 'Снят курьер ' || v_name || coalesce(': ' || p_reason, ''));
  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'release_courier', 'orders', p_order::text, jsonb_build_object('reason', p_reason));
  perform public.dispatch_order(p_order, o.courier_id);
end $$;

-- couriers may no longer pick orders themselves
revoke execute on function public.courier_accept_order(uuid), public.courier_reject_order(uuid), public.courier_available_orders()
  from authenticated;

-- GPS: allowed while online (needed to pick the nearest free courier), still rate-limited
create or replace function public.report_courier_location(p_lat float8, p_lon float8) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if not public.has_role('COURIER') then raise exception 'FORBIDDEN'; end if;
  if p_lat not between 40 and 56 or p_lon not between 46 and 88 then raise exception 'BAD_COORDS'; end if;
  if not exists (select 1 from public.couriers where user_id = v_uid and is_active and is_online)
     and public.courier_active_count(v_uid) = 0 then
    return false;
  end if;
  if exists (select 1 from public.courier_locations where courier_id = v_uid and created_at > now() - interval '5 seconds') then
    return false;
  end if;
  insert into public.courier_locations(courier_id, lat, lon) values (v_uid, p_lat, p_lon);
  return true;
end $$;

-- couriers can see the branch staff names/phones? no. They see their own orders (orders_read: courier_id = auth.uid()).
-- the old "READY & unassigned visible to all couriers" preview is no longer needed:
drop policy orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated using (
  user_id = auth.uid() or public.is_backoffice()
  or branch_id in (select public.staff_branch_ids())
  or courier_id = auth.uid());
drop policy order_items_read on public.order_items;
create policy order_items_read on public.order_items for select to authenticated using (public.can_see_order(order_id));

alter publication supabase_realtime add table public.couriers;
