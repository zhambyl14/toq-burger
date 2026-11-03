-- Moderators, support threads (customers + couriers), named action history on orders,
-- admin-managed staff phone changes.

-- ---------- helpers ----------
create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role('MODERATOR')
$$;
create or replace function public.is_backoffice() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role('ADMIN') or public.has_role('MODERATOR')
$$;

/** Human-readable name of a user for history/support (staff display name > profile name > courier name > phone). */
create or replace function public.person_name(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select si.display_name from public.staff_invites si join public.profiles p on p.phone = si.phone
      where p.id = p_user and si.display_name is not null order by si.created_at limit 1),
    (select nullif(trim(full_name), '') from public.profiles where id = p_user),
    (select display_name from public.couriers where user_id = p_user),
    (select phone from public.profiles where id = p_user),
    'Система')
$$;

/** Highest-privilege role of a user. */
create or replace function public.primary_role(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select r.role::text from public.user_roles r where r.user_id = p_user
    order by array_position(array['ADMIN','MODERATOR','OPERATOR','KITCHEN','COURIER','CUSTOMER'], r.role::text) limit 1), 'SYSTEM')
$$;

grant execute on function public.is_moderator(), public.is_backoffice() to authenticated;
revoke execute on function public.person_name(uuid), public.primary_role(uuid) from public, anon, authenticated;

-- ---------- order history: who did what ----------
alter table public.order_status_history
  add column actor_name text,
  add column actor_role text,
  add column event text not null default 'STATUS'
    check (event in ('STATUS','COURIER_REJECTED','COURIER_RELEASED','SUPPORT_REPLY','NOTE')),
  alter column to_status drop not null;

-- backfill existing rows
update public.order_status_history h set
  actor_name = case when h.actor_id is null then 'Система' else public.person_name(h.actor_id) end,
  actor_role = case when h.actor_id is null then 'SYSTEM' else public.primary_role(h.actor_id) end
where actor_name is null;

create or replace function public.add_order_event(p_order uuid, p_event text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  insert into public.order_status_history(order_id, from_status, to_status, actor_id, actor_name, actor_role, event, note)
  select o.id, null, null, v_uid,
    case when v_uid is null then 'Система' else public.person_name(v_uid) end,
    case when v_uid is null then 'SYSTEM' else public.primary_role(v_uid) end,
    p_event, left(p_note, 500)
  from public.orders o where o.id = p_order;
end $$;
revoke execute on function public.add_order_event(uuid, text, text) from public, anon, authenticated;

create or replace function public.log_order_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_title text; v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_status_history(order_id, from_status, to_status, actor_id, actor_name, actor_role, event)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, v_uid,
      case when v_uid is null then 'Система' else public.person_name(v_uid) end,
      case when v_uid is null then 'SYSTEM' else public.primary_role(v_uid) end, 'STATUS');
    v_title := case new.status
      when 'PENDING' then 'Заказ принят' when 'ACCEPTED' then 'Заказ передан на кухню'
      when 'PREPARING' then 'Заказ готовится' when 'READY' then 'Заказ готов'
      when 'COURIER_ASSIGNED' then 'Курьер назначен' when 'PICKED_UP' then 'Курьер забрал заказ'
      when 'ON_THE_WAY' then 'Курьер в пути' when 'DELIVERED' then 'Заказ доставлен'
      when 'CANCELLED' then 'Заказ отменён' end;
    insert into public.notifications(user_id, event, title, body, order_id)
    values (new.user_id, 'order.' || lower(new.status::text), v_title, '#TB-' || new.order_no, new.id);
  end if;
  return new;
end $$;

-- ---------- moderators may manage order status like admins ----------
create or replace function public.transition_order(p_order uuid, p_to public.order_status, p_note text default null)
returns public.order_status
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  o public.orders;
  v_ok boolean := false;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public.order_transition_allowed(o.status, p_to, o.mode) then raise exception 'INVALID_TRANSITION'; end if;

  if public.is_backoffice() then v_ok := true;
  elsif o.branch_id in (select public.staff_branch_ids()) then
    v_ok := p_to in ('ACCEPTED','PREPARING','READY','CANCELLED') or (p_to = 'DELIVERED' and o.mode = 'PICKUP');
  elsif o.courier_id = v_uid and public.has_role('COURIER') then
    v_ok := p_to in ('PICKED_UP','ON_THE_WAY','DELIVERED');
  elsif o.user_id = v_uid then
    v_ok := p_to = 'CANCELLED' and o.status = 'PENDING';
  end if;
  if not v_ok then raise exception 'FORBIDDEN'; end if;
  if p_to = 'COURIER_ASSIGNED' then raise exception 'USE_COURIER_ACCEPT'; end if;

  update public.orders set status = p_to,
    accepted_at = case when p_to = 'ACCEPTED' then now() else accepted_at end,
    preparing_at = case when p_to = 'PREPARING' then now() else preparing_at end,
    ready_at = case when p_to = 'READY' then now() else ready_at end,
    picked_up_at = case when p_to = 'PICKED_UP' then now() else picked_up_at end,
    delivered_at = case when p_to = 'DELIVERED' then now() else delivered_at end,
    cancelled_at = case when p_to = 'CANCELLED' then now() else cancelled_at end
  where id = p_order;

  if p_note is not null then
    update public.order_status_history set note = left(p_note, 300)
    where id = (select max(id) from public.order_status_history where order_id = p_order);
  end if;
  if p_to = 'CANCELLED' then
    update public.courier_assignments set status = 'CANCELLED', responded_at = now()
    where order_id = p_order and status in ('OFFERED','ACCEPTED');
  elsif p_to = 'DELIVERED' then
    update public.courier_assignments set status = 'COMPLETED' where order_id = p_order and status = 'ACCEPTED';
  end if;
  return p_to;
end $$;

create or replace function public.release_courier(p_order uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders; v_name text;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_backoffice() or o.branch_id in (select public.staff_branch_ids())) then raise exception 'FORBIDDEN'; end if;
  if o.status <> 'COURIER_ASSIGNED' then raise exception 'INVALID_TRANSITION'; end if;
  v_name := public.person_name(o.courier_id);
  update public.courier_assignments set status = 'CANCELLED', responded_at = now()
    where order_id = p_order and status = 'ACCEPTED';
  update public.orders set courier_id = null, status = 'READY' where id = p_order;
  perform public.add_order_event(p_order, 'COURIER_RELEASED', 'Снят курьер ' || v_name || coalesce(': ' || p_reason, ''));
  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'release_courier', 'orders', p_order::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.courier_reject_order(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('COURIER') then raise exception 'FORBIDDEN'; end if;
  insert into public.courier_assignments(order_id, courier_id, status, responded_at)
  values (p_order, auth.uid(), 'REJECTED', now());
  perform public.add_order_event(p_order, 'COURIER_REJECTED', 'Курьер отказался от заказа');
end $$;

-- ---------- visibility for moderators ----------
create or replace function public.can_see_order(p_order uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.orders o where o.id = p_order and (
    o.user_id = auth.uid() or public.is_backoffice()
    or o.branch_id in (select public.staff_branch_ids())
    or (o.courier_id = auth.uid())))
$$;

drop policy orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated using (
  user_id = auth.uid() or public.is_backoffice()
  or branch_id in (select public.staff_branch_ids())
  or courier_id = auth.uid()
  or (status = 'READY' and mode = 'DELIVERY' and courier_id is null and public.has_role('COURIER')));

drop policy couriers_read on public.couriers;
create policy couriers_read on public.couriers for select to authenticated using (user_id = auth.uid() or public.is_backoffice()
  or exists (select 1 from public.orders o where o.courier_id = couriers.user_id and o.user_id = auth.uid()
             and o.status in ('COURIER_ASSIGNED','PICKED_UP','ON_THE_WAY'))
  or exists (select 1 from public.orders o where o.courier_id = couriers.user_id and o.branch_id in (select public.staff_branch_ids())));

drop policy profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_backoffice());

-- ---------- support threads ----------
alter table public.support_requests
  add column kind text not null default 'CUSTOMER' check (kind in ('CUSTOMER','COURIER')),
  add column updated_at timestamptz not null default now(),
  add column requester_name text;

create or replace function public.support_request_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.kind := case when new.kind = 'COURIER' and public.has_role('COURIER') then 'COURIER' else 'CUSTOMER' end;
  new.requester_name := public.person_name(new.user_id);
  new.status := 'OPEN';
  new.updated_at := now();
  -- customers may only attach their own orders; couriers only orders they deliver(ed)
  if new.order_id is not null and not exists (
       select 1 from public.orders o where o.id = new.order_id and (o.user_id = new.user_id or o.courier_id = new.user_id)) then
    new.order_id := null;
  end if;
  return new;
end $$;
create trigger trg_support_defaults before insert on public.support_requests
  for each row execute function public.support_request_defaults();

create table public.support_messages (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.support_requests(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  author_name text,
  author_role text,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on public.support_messages(request_id, created_at);
alter table public.support_messages enable row level security;

create policy support_messages_read on public.support_messages for select to authenticated using (
  public.is_backoffice()
  or exists (select 1 from public.support_requests r where r.id = request_id and r.user_id = auth.uid()));
create policy support_messages_insert on public.support_messages for insert to authenticated with check (
  author_id = auth.uid() and (
    public.is_backoffice()
    or exists (select 1 from public.support_requests r where r.id = request_id and r.user_id = auth.uid() and r.status <> 'CLOSED')));

create or replace function public.support_message_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.support_requests;
begin
  new.author_name := public.person_name(new.author_id);
  new.author_role := public.primary_role(new.author_id);
  new.created_at := now();
  select * into r from public.support_requests where id = new.request_id;
  if public.is_backoffice() and new.author_id <> r.user_id then
    update public.support_requests set updated_at = now(),
      status = case when status = 'OPEN' then 'IN_PROGRESS' else status end
    where id = new.request_id;
    if r.order_id is not null then
      perform public.add_order_event(r.order_id, 'SUPPORT_REPLY', 'Ответ поддержки: ' || left(new.body, 200));
    end if;
  else
    update public.support_requests set updated_at = now(),
      status = case when status = 'IN_PROGRESS' then 'OPEN' else status end
    where id = new.request_id;
  end if;
  return new;
end $$;
create trigger trg_support_message_defaults before insert on public.support_messages
  for each row execute function public.support_message_defaults();

drop policy support_own on public.support_requests;
create policy support_own on public.support_requests for select to authenticated
  using (user_id = auth.uid() or public.is_backoffice());
drop policy support_admin_update on public.support_requests;
create policy support_admin_update on public.support_requests for update to authenticated
  using (public.is_backoffice()) with check (public.is_backoffice());

grant select, insert on public.support_messages to authenticated;
grant all on public.support_messages to service_role;
alter publication supabase_realtime add table public.support_messages, public.support_requests;

-- ---------- staff management: moderators + phone change ----------
create or replace function public.admin_change_staff_phone(p_old text, p_new text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_new !~ '^\+7[0-9]{10}$' or p_old !~ '^\+7[0-9]{10}$' then raise exception 'BAD_PHONE'; end if;
  if p_old = p_new then return; end if;
  if not exists (select 1 from public.staff_invites where phone = p_old) then raise exception 'NOT_STAFF'; end if;
  if exists (select 1 from public.profiles where phone = p_new) or exists (select 1 from public.staff_invites where phone = p_new) then
    raise exception 'PHONE_TAKEN';
  end if;
  update public.staff_invites set phone = p_new where phone = p_old;
  update public.profiles set phone = p_new where phone = p_old returning id into v_user;
  -- the auth identity (internal email + app_metadata.phone) is re-synced on the next WhatsApp login
  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'change_staff_phone', 'staff_invites', coalesce(v_user::text, p_new),
          jsonb_build_object('old', p_old, 'new', p_new));
end $$;
grant execute on function public.admin_change_staff_phone(text, text) to authenticated;
-- admin_invite_staff already accepts any non-CUSTOMER role (MODERATOR needs no branch).
