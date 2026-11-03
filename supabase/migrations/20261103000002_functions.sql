-- TOK BURGER: authorization helpers + atomic business functions.

-- ---------- role helpers (security definer: bypass RLS on user_roles) ----------
create or replace function public.has_role(r public.user_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = r)
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role('ADMIN')
$$;
create or replace function public.staff_branch_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select branch_id from public.user_roles
  where user_id = auth.uid() and role in ('KITCHEN','OPERATOR') and branch_id is not null
$$;
create or replace function public.my_roles() returns setof public.user_role
language sql stable security definer set search_path = '' as $$
  select role from public.user_roles where user_id = auth.uid()
$$;

-- ---------- new auth user => profile + CUSTOMER role ----------
-- Phone comes from app_metadata (writable only with the service role), never from user_metadata.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_phone text := new.raw_app_meta_data->>'phone';
begin
  if v_phone is null or v_phone !~ '^\+7[0-9]{10}$' then
    return new; -- staff created another way get a profile from the admin flow
  end if;
  insert into public.profiles(id, phone) values (new.id, v_phone) on conflict (id) do nothing;
  insert into public.user_roles(user_id, role) values (new.id, 'CUSTOMER') on conflict do nothing;
  insert into public.loyalty_accounts(user_id) values (new.id) on conflict do nothing;
  perform public.apply_staff_invites(new.id, v_phone);
  return new;
end $$;

create or replace function public.apply_staff_invites(p_user uuid, p_phone text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_roles(user_id, role, branch_id)
    select p_user, i.role, i.branch_id from public.staff_invites i where i.phone = p_phone
    on conflict do nothing;
  insert into public.couriers(user_id, display_name)
    select p_user, coalesce(max(i.display_name), 'Курьер') from public.staff_invites i
    where i.phone = p_phone and i.role = 'COURIER'
    having count(*) > 0
    on conflict (user_id) do update set is_active = true;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- geo + working hours ----------
create or replace function public.haversine_km(lat1 float8, lon1 float8, lat2 float8, lon2 float8)
returns float8 language sql immutable as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)))
$$;

create or replace function public.branch_is_open(p_branch uuid, p_at timestamptz default now())
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.branch_working_hours h
    where h.branch_id = p_branch
      and h.day_of_week = (extract(isodow from (p_at at time zone 'Asia/Almaty'))::int - 1)
      and (p_at at time zone 'Asia/Almaty')::time >= h.open_time
      and ((p_at at time zone 'Asia/Almaty')::time < h.close_time or h.close_time = '00:00'::time)
  )
$$;

-- Nearest eligible branch: active, accepting, verified coords, open (or scheduled time), inside radius.
create or replace function public.find_delivery_branch(p_lat float8, p_lon float8, p_at timestamptz default now())
returns table (branch_id uuid, distance_km float8, delivery_fee_kzt int, nearest_any_km float8)
language sql stable set search_path = '' as $$
  with c as (
    select b.*, public.haversine_km(p_lat, p_lon, b.lat, b.lon) as d
    from public.branches b
    where b.is_active and b.coords_verified and b.lat is not null
  )
  select e.id, e.d, e.delivery_fee_kzt, (select min(d) from c)
  from c e
  where e.accepts_orders and e.d <= e.delivery_radius_km and public.branch_is_open(e.id, p_at)
  order by e.d
  limit 1
$$;

-- ---------- ordering ----------
-- p_items: [{ "product_id": uuid, "meat": "beef", "quantity": 2, "extra_ids": [uuid,...] }]
-- Prices come from the DB only. Idempotent per (user, key).
create or replace function public.place_order(
  p_idempotency_key text,
  p_mode public.fulfillment_mode,
  p_items jsonb,
  p_payment public.payment_method,
  p_contact_phone text,
  p_branch_id uuid default null,          -- pickup only
  p_lat float8 default null, p_lon float8 default null, p_address text default null,
  p_apartment text default null, p_entrance text default null, p_floor text default null, p_intercom text default null,
  p_courier_instructions text default null, p_note text default null,
  p_promo_code text default null, p_scheduled_for timestamptz default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_existing uuid;
  v_branch uuid;
  v_fee int := 0;
  v_at timestamptz := coalesce(p_scheduled_for, now());
  v_order uuid;
  v_sub int := 0;
  v_disc int := 0;
  v_item jsonb;
  v_prod record;
  v_unit int;
  v_extras jsonb;
  v_extra_sum int;
  v_qty int;
  v_promo record;
  v_lines jsonb := '[]';
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 100 then raise exception 'BAD_IDEMPOTENCY_KEY'; end if;
  if p_contact_phone !~ '^\+7[0-9]{10}$' then raise exception 'BAD_PHONE'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then raise exception 'EMPTY_CART'; end if;
  if p_scheduled_for is not null and (p_scheduled_for < now() or p_scheduled_for > now() + interval '7 days') then raise exception 'BAD_SCHEDULE'; end if;

  -- serialize concurrent submissions of the same user, then dedupe
  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  select id into v_existing from public.orders where user_id = v_uid and idempotency_key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  if p_mode = 'DELIVERY' then
    if p_lat is null or p_lon is null or coalesce(trim(p_address), '') = '' then raise exception 'ADDRESS_REQUIRED'; end if;
    select f.branch_id, f.delivery_fee_kzt into v_branch, v_fee from public.find_delivery_branch(p_lat, p_lon, v_at) f;
    if v_branch is null then raise exception 'OUT_OF_ZONE'; end if;
  else
    select id into v_branch from public.branches
      where id = p_branch_id and is_active and accepts_orders and public.branch_is_open(id, v_at);
    if v_branch is null then raise exception 'BRANCH_UNAVAILABLE'; end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::int;
    if v_qty is null or v_qty < 1 or v_qty > 50 then raise exception 'BAD_QUANTITY'; end if;

    select p.id, p.name, v.price_kzt, v.meat, p.extra_group_id into v_prod
    from public.products p
    join public.product_variants v on v.product_id = p.id and v.meat = (v_item->>'meat')::public.meat_type
    where p.id = (v_item->>'product_id')::uuid and p.is_active and v.is_active
      and not exists (select 1 from public.product_availability a
                      where a.branch_id = v_branch and a.product_id = p.id and not a.is_available);
    if not found or v_prod.price_kzt is null then raise exception 'PRODUCT_UNAVAILABLE'; end if;

    select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'price_kzt', e.price_kzt) order by e.sort_order), '[]'),
           coalesce(sum(e.price_kzt), 0)
      into v_extras, v_extra_sum
    from public.product_extras e
    where e.id in (select (x)::uuid from jsonb_array_elements_text(coalesce(v_item->'extra_ids', '[]')) x)
      and e.is_active and e.group_id = v_prod.extra_group_id;
    if jsonb_array_length(v_extras) <> (select count(distinct x) from jsonb_array_elements_text(coalesce(v_item->'extra_ids', '[]')) x) then
      raise exception 'EXTRA_UNAVAILABLE';
    end if;

    v_unit := v_prod.price_kzt + v_extra_sum;
    v_sub := v_sub + v_unit * v_qty;
    v_lines := v_lines || jsonb_build_object('product_id', v_prod.id, 'name', v_prod.name, 'meat', v_prod.meat,
      'quantity', v_qty, 'unit', v_unit, 'extras', v_extras);
  end loop;

  if p_mode = 'DELIVERY' and v_sub < (select min_order_kzt from public.branches where id = v_branch) then
    raise exception 'BELOW_MIN_ORDER';
  end if;

  if coalesce(trim(p_promo_code), '') <> '' then
    select * into v_promo from public.promotions
      where code = upper(trim(p_promo_code)) and is_active
        and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
        and (max_uses is null or used_count < max_uses)
      for update;
    if not found or v_sub < v_promo.min_subtotal_kzt then raise exception 'PROMO_INVALID'; end if;
    v_disc := least(v_sub, coalesce(v_promo.amount_off_kzt, (v_sub * v_promo.percent_off) / 100));
    update public.promotions set used_count = used_count + 1 where id = v_promo.id;
  end if;

  if p_mode = 'PICKUP' then v_fee := 0; end if;

  insert into public.orders(user_id, branch_id, mode, idempotency_key, contact_phone, customer_name,
    address_text, lat, lon, apartment, entrance, floor, intercom, courier_instructions, note, scheduled_for,
    subtotal_kzt, discount_kzt, delivery_fee_kzt, total_kzt, promo_code, payment_method)
  values (v_uid, v_branch, p_mode, p_idempotency_key, p_contact_phone,
    (select full_name from public.profiles where id = v_uid),
    case when p_mode = 'DELIVERY' then left(p_address, 300) end,
    case when p_mode = 'DELIVERY' then p_lat end, case when p_mode = 'DELIVERY' then p_lon end,
    left(p_apartment, 20), left(p_entrance, 20), left(p_floor, 20), left(p_intercom, 30),
    left(p_courier_instructions, 300), left(p_note, 500), p_scheduled_for,
    v_sub, v_disc, v_fee, v_sub - v_disc + v_fee,
    case when v_disc > 0 then upper(trim(p_promo_code)) end, p_payment)
  returning id into v_order;

  insert into public.order_items(order_id, product_id, product_name, meat, quantity, unit_price_kzt, extras, line_total_kzt)
  select v_order, (l->>'product_id')::uuid, l->>'name', (l->>'meat')::public.meat_type, (l->>'quantity')::int,
         (l->>'unit')::int, l->'extras', (l->>'unit')::int * (l->>'quantity')::int
  from jsonb_array_elements(v_lines) l;

  -- payment row: never PAID here; a verified provider callback must flip it.
  insert into public.payments(order_id, method, amount_kzt, provider)
  values (v_order, p_payment, v_sub - v_disc + v_fee, case p_payment when 'CASH' then 'cash' else 'unconfigured' end);

  return v_order;
end $$;

-- ---------- order lifecycle ----------
create or replace function public.order_transition_allowed(f public.order_status, t public.order_status, m public.fulfillment_mode)
returns boolean language sql immutable as $$
  select case
    when t = 'CANCELLED' then f in ('PENDING','ACCEPTED','PREPARING','READY','COURIER_ASSIGNED')
    when f = 'PENDING' then t = 'ACCEPTED'
    when f = 'ACCEPTED' then t = 'PREPARING'
    when f = 'PREPARING' then t = 'READY'
    when f = 'READY' then (m = 'PICKUP' and t = 'DELIVERED') or (m = 'DELIVERY' and t = 'COURIER_ASSIGNED')
    when f = 'COURIER_ASSIGNED' then t = 'PICKED_UP'
    when f = 'PICKED_UP' then t = 'ON_THE_WAY'
    when f = 'ON_THE_WAY' then t = 'DELIVERED'
    else false end
$$;

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

  if public.is_admin() then v_ok := true;
  elsif o.branch_id in (select public.staff_branch_ids()) then
    v_ok := p_to in ('ACCEPTED','PREPARING','READY','CANCELLED') or (p_to = 'DELIVERED' and o.mode = 'PICKUP');
  elsif o.courier_id = v_uid and public.has_role('COURIER') then
    v_ok := p_to in ('PICKED_UP','ON_THE_WAY','DELIVERED');
  elsif o.user_id = v_uid then
    v_ok := p_to = 'CANCELLED' and o.status = 'PENDING';
  end if;
  if not v_ok then raise exception 'FORBIDDEN'; end if;
  -- COURIER_ASSIGNED is set only by courier_accept_order
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

-- history + customer notification on every status change
create or replace function public.log_order_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_title text;
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_status_history(order_id, from_status, to_status, actor_id)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
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
create trigger trg_orders_status after insert or update of status on public.orders
  for each row execute function public.log_order_status();

-- ---------- couriers ----------
create or replace function public.courier_available_orders()
returns setof public.orders language sql stable security definer set search_path = '' as $$
  select o.* from public.orders o
  where public.has_role('COURIER')
    and exists (select 1 from public.couriers c where c.user_id = auth.uid() and c.is_active)
    and o.mode = 'DELIVERY' and o.status = 'READY' and o.courier_id is null
    and not exists (select 1 from public.courier_assignments a
                    where a.order_id = o.id and a.courier_id = auth.uid() and a.status = 'REJECTED')
  order by o.ready_at nulls last
$$;

-- Atomic: only one courier can win; conditional UPDATE + unique partial index.
create or replace function public.courier_accept_order(p_order uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_rows int;
begin
  if not public.has_role('COURIER') or not exists (select 1 from public.couriers where user_id = v_uid and is_active) then
    raise exception 'FORBIDDEN';
  end if;
  if exists (select 1 from public.orders where courier_id = v_uid and status in ('COURIER_ASSIGNED','PICKED_UP','ON_THE_WAY')) then
    raise exception 'ALREADY_ON_DELIVERY';
  end if;
  update public.orders set courier_id = v_uid, status = 'COURIER_ASSIGNED'
  where id = p_order and status = 'READY' and mode = 'DELIVERY' and courier_id is null;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return false; end if;
  insert into public.courier_assignments(order_id, courier_id, status, responded_at)
  values (p_order, v_uid, 'ACCEPTED', now());
  return true;
end $$;

create or replace function public.courier_reject_order(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('COURIER') then raise exception 'FORBIDDEN'; end if;
  insert into public.courier_assignments(order_id, courier_id, status, responded_at)
  values (p_order, auth.uid(), 'REJECTED', now());
end $$;

-- Admin / branch staff: release a courier (failed pickup etc.) => order back to READY.
create or replace function public.release_courier(p_order uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_admin() or o.branch_id in (select public.staff_branch_ids())) then raise exception 'FORBIDDEN'; end if;
  if o.status <> 'COURIER_ASSIGNED' then raise exception 'INVALID_TRANSITION'; end if;
  update public.courier_assignments set status = 'CANCELLED', responded_at = now()
    where order_id = p_order and status = 'ACCEPTED';
  -- direct status rewind, recorded in history by trigger
  update public.orders set courier_id = null, status = 'READY' where id = p_order;
  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'release_courier', 'orders', p_order::text, jsonb_build_object('reason', p_reason));
end $$;

-- GPS: courier only, active delivery only, max one point per 5 s.
create or replace function public.report_courier_location(p_lat float8, p_lon float8) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if not public.has_role('COURIER') then raise exception 'FORBIDDEN'; end if;
  if p_lat not between 40 and 56 or p_lon not between 46 and 88 then raise exception 'BAD_COORDS'; end if;
  if not exists (select 1 from public.orders where courier_id = v_uid and status in ('COURIER_ASSIGNED','PICKED_UP','ON_THE_WAY')) then
    return false;
  end if;
  if exists (select 1 from public.courier_locations where courier_id = v_uid and created_at > now() - interval '5 seconds') then
    return false;
  end if;
  insert into public.courier_locations(courier_id, lat, lon) values (v_uid, p_lat, p_lon);
  return true;
end $$;

-- ---------- WhatsApp OTP (service_role only) ----------
-- Returns: 'OK' | 'COOLDOWN' | 'RATE_LIMITED'
create or replace function public.otp_issue(p_phone text, p_hash text, p_ip inet, p_ttl_seconds int default 300)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('otp:' || p_phone));
  if exists (select 1 from public.whatsapp_otp_verifications
             where phone_number = p_phone and created_at > now() - interval '60 seconds') then
    return 'COOLDOWN';
  end if;
  if (select count(*) from public.whatsapp_otp_verifications
      where phone_number = p_phone and created_at > now() - interval '1 hour') >= 5
     or (p_ip is not null and (select count(*) from public.whatsapp_otp_verifications
      where request_ip = p_ip and created_at > now() - interval '1 hour') >= 20) then
    return 'RATE_LIMITED';
  end if;
  -- invalidate previous codes
  update public.whatsapp_otp_verifications set consumed_at = now()
    where phone_number = p_phone and consumed_at is null;
  insert into public.whatsapp_otp_verifications(phone_number, otp_hash, expires_at, request_ip)
  values (p_phone, p_hash, now() + make_interval(secs => p_ttl_seconds), p_ip);
  return 'OK';
end $$;

-- Used when WhatsApp delivery failed: drop the code so it cannot be used and does not block resend.
create or replace function public.otp_cancel_latest(p_phone text) returns void
language sql security definer set search_path = '' as $$
  delete from public.whatsapp_otp_verifications
  where id = (select id from public.whatsapp_otp_verifications
              where phone_number = p_phone and consumed_at is null order by created_at desc limit 1)
$$;

-- Atomic verify+consume. Returns 'OK' | 'INVALID' | 'EXPIRED' | 'LOCKED' | 'NOT_FOUND'
create or replace function public.otp_verify(p_phone text, p_hash text)
returns text language plpgsql security definer set search_path = '' as $$
declare r public.whatsapp_otp_verifications;
begin
  select * into r from public.whatsapp_otp_verifications
    where phone_number = p_phone and consumed_at is null
    order by created_at desc limit 1
    for update;
  if not found then return 'NOT_FOUND'; end if;
  if r.expires_at <= now() then
    update public.whatsapp_otp_verifications set consumed_at = now() where id = r.id;
    return 'EXPIRED';
  end if;
  if r.attempts >= r.max_attempts then return 'LOCKED'; end if;
  if r.otp_hash <> p_hash then
    update public.whatsapp_otp_verifications set attempts = attempts + 1,
      consumed_at = case when attempts + 1 >= max_attempts then now() else null end
    where id = r.id;
    return case when r.attempts + 1 >= r.max_attempts then 'LOCKED' else 'INVALID' end;
  end if;
  update public.whatsapp_otp_verifications set verified_at = now(), consumed_at = now() where id = r.id;
  return 'OK';
end $$;

-- ---------- function privileges ----------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.has_role(public.user_role), public.is_admin(), public.staff_branch_ids(), public.my_roles(),
  public.haversine_km(float8,float8,float8,float8), public.branch_is_open(uuid,timestamptz),
  public.find_delivery_branch(float8,float8,timestamptz), public.order_transition_allowed(public.order_status,public.order_status,public.fulfillment_mode)
  to anon, authenticated;
grant execute on function public.place_order(text,public.fulfillment_mode,jsonb,public.payment_method,text,uuid,float8,float8,text,text,text,text,text,text,text,text,timestamptz),
  public.transition_order(uuid,public.order_status,text), public.courier_available_orders(),
  public.courier_accept_order(uuid), public.courier_reject_order(uuid), public.release_courier(uuid,text),
  public.report_courier_location(float8,float8)
  to authenticated;
revoke execute on function public.otp_issue(text,text,inet,int), public.otp_verify(text,text), public.otp_cancel_latest(text) from authenticated;
grant execute on function public.otp_issue(text,text,inet,int), public.otp_verify(text,text), public.otp_cancel_latest(text) to service_role;
