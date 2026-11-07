-- TOK BURGER: admin-managed payments (Kaspi transfer + receipt review), offline (walk-in) orders,
-- kitchen cannot cancel (cancel *requests* go to back office), admin can create/delete branches.
-- Never edit after applying; add a new migration.

-- =====================================================================================
-- 1. orders: source, payment state, cancel request, nullable customer (walk-in orders)
-- =====================================================================================
alter table public.orders alter column user_id drop not null;
alter table public.orders
  add column if not exists source text not null default 'ONLINE' check (source in ('ONLINE','OFFLINE')),
  add column if not exists payment_state text not null default 'NOT_REQUIRED'
    check (payment_state in ('NOT_REQUIRED','AWAITING_RECEIPT','REVIEW','CONFIRMED','REJECTED')),
  add column if not exists placed_by uuid,
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists cancel_requested_by uuid,
  add column if not exists cancel_request_reason text;
alter table public.orders drop constraint if exists orders_user_or_offline;
alter table public.orders add constraint orders_user_or_offline check (source = 'OFFLINE' or user_id is not null);
create index if not exists orders_source_idx on public.orders(branch_id, source, created_at desc);
create index if not exists orders_unpaid_idx on public.orders(payment_state) where payment_state in ('AWAITING_RECEIPT','REVIEW','REJECTED');
create index if not exists orders_cancel_req_idx on public.orders(cancel_requested_at) where cancel_requested_at is not null;

-- =====================================================================================
-- 2. payment settings (single row, managed by the admin)
-- =====================================================================================
create table if not exists public.payment_settings (
  id smallint primary key default 1 check (id = 1),
  cash_enabled boolean not null default true,
  cash_note text check (length(cash_note) <= 300),
  cash_note_kk text check (length(cash_note_kk) <= 300),
  kaspi_enabled boolean not null default false,
  kaspi_phone text check (kaspi_phone is null or kaspi_phone ~ '^\+7[0-9]{10}$'),
  kaspi_recipient text check (length(kaspi_recipient) <= 80),
  kaspi_pay_url text check (kaspi_pay_url is null or (kaspi_pay_url ~ '^https://[^[:space:]]+$' and length(kaspi_pay_url) <= 500)),
  kaspi_qr_path text check (kaspi_qr_path is null or (kaspi_qr_path like 'payment/%' and length(kaspi_qr_path) <= 200)),
  kaspi_note text check (length(kaspi_note) <= 400),
  kaspi_note_kk text check (length(kaspi_note_kk) <= 400),
  pay_timeout_min integer not null default 30 check (pay_timeout_min between 5 and 1440),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.payment_settings(id) values (1) on conflict (id) do nothing;

create or replace function public.payment_settings_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists trg_payment_settings_touch on public.payment_settings;
create trigger trg_payment_settings_touch before update on public.payment_settings
  for each row execute function public.payment_settings_touch();
drop trigger if exists trg_audit_payment_settings on public.payment_settings;
create trigger trg_audit_payment_settings after update on public.payment_settings
  for each row execute function public.audit_row();

alter table public.payment_settings enable row level security;
drop policy if exists payment_settings_read on public.payment_settings;
create policy payment_settings_read on public.payment_settings for select to anon, authenticated using (true);
drop policy if exists payment_settings_admin on public.payment_settings;
create policy payment_settings_admin on public.payment_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.payment_settings from anon, authenticated;
grant select on public.payment_settings to anon, authenticated;
grant update on public.payment_settings to authenticated;

-- =====================================================================================
-- 3. payments: receipt + review data
-- =====================================================================================
alter table public.payments
  add column if not exists receipt_path text,
  add column if not exists receipt_uploaded_at timestamptz,
  add column if not exists attempts smallint not null default 0,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_by_name text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reject_reason text;
create unique index if not exists payments_one_per_order on public.payments(order_id);

-- Online orders: payment method must be enabled by the admin; Kaspi orders wait for a verified receipt.
create or replace function public.orders_payment_gate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.payment_settings;
begin
  if new.source <> 'ONLINE' then return new; end if;
  select * into s from public.payment_settings where id = 1;
  if new.payment_method = 'CASH' then
    if not s.cash_enabled then raise exception 'PAYMENT_UNAVAILABLE'; end if;
    new.payment_state := 'NOT_REQUIRED';
  elsif new.payment_method = 'KASPI_QR' then
    if not s.kaspi_enabled or coalesce(s.kaspi_phone, s.kaspi_pay_url, s.kaspi_qr_path) is null then
      raise exception 'PAYMENT_UNAVAILABLE';
    end if;
    new.payment_state := 'AWAITING_RECEIPT';
  else
    raise exception 'PAYMENT_UNAVAILABLE';
  end if;
  return new;
end $$;
drop trigger if exists trg_orders_payment_gate on public.orders;
create trigger trg_orders_payment_gate before insert on public.orders
  for each row execute function public.orders_payment_gate();

create or replace function public.payments_defaults() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.method = 'KASPI_QR' and new.provider = 'unconfigured' then new.provider := 'kaspi_manual'; end if;
  return new;
end $$;
drop trigger if exists trg_payments_defaults on public.payments;
create trigger trg_payments_defaults before insert on public.payments
  for each row execute function public.payments_defaults();

-- =====================================================================================
-- 4. visibility: branch staff see an online order only once it is payable (cash / confirmed)
-- =====================================================================================
create or replace function public.can_see_order(p_order uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.orders o where o.id = p_order and (
    o.user_id = auth.uid() or public.is_backoffice()
    or (o.branch_id in (select public.staff_branch_ids()) and o.payment_state in ('NOT_REQUIRED','CONFIRMED'))
    or o.courier_id = auth.uid()))
$$;

drop policy if exists orders_read on public.orders;
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated using (
  user_id = auth.uid() or public.is_backoffice()
  or (branch_id in (select public.staff_branch_ids()) and payment_state in ('NOT_REQUIRED','CONFIRMED'))
  or courier_id = auth.uid());

-- =====================================================================================
-- 5. history/notifications trigger: tolerate walk-in orders (no customer), payment wording
-- =====================================================================================
create or replace function public.log_order_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_title text; v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_status_history(order_id, from_status, to_status, actor_id, actor_name, actor_role, event)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, v_uid,
      case when v_uid is null then 'Система' else public.person_name(v_uid) end,
      case when v_uid is null then 'SYSTEM' else public.primary_role(v_uid) end, 'STATUS');
    if new.user_id is not null then
      v_title := case new.status
        when 'PENDING' then case when new.payment_state = 'AWAITING_RECEIPT' then 'Ожидаем оплату' else 'Заказ принят' end
        when 'ACCEPTED' then 'Заказ передан на кухню'
        when 'PREPARING' then 'Заказ готовится' when 'READY' then 'Заказ готов'
        when 'COURIER_ASSIGNED' then 'Курьер назначен' when 'PICKED_UP' then 'Курьер забрал заказ'
        when 'ON_THE_WAY' then 'Курьер в пути' when 'DELIVERED' then 'Заказ доставлен'
        when 'CANCELLED' then 'Заказ отменён' end;
      insert into public.notifications(user_id, event, title, body, order_id)
      values (new.user_id, 'order.' || lower(new.status::text), v_title, '#TB-' || new.order_no, new.id);
    end if;
  end if;
  return new;
end $$;

-- =====================================================================================
-- 6. lifecycle: kitchen/operator can NOT cancel; payment must be confirmed before kitchen work
-- =====================================================================================
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
    -- cancelling is a back-office decision: kitchen files a request (request_order_cancel)
    v_ok := p_to in ('ACCEPTED','PREPARING','READY') or (p_to = 'DELIVERED' and o.mode = 'PICKUP');
  elsif o.courier_id = v_uid and public.has_role('COURIER') then
    v_ok := p_to in ('PICKED_UP','ON_THE_WAY','DELIVERED');
  elsif o.user_id = v_uid then
    v_ok := p_to = 'CANCELLED' and o.status = 'PENDING';
  end if;
  if not v_ok then raise exception 'FORBIDDEN'; end if;
  if p_to = 'COURIER_ASSIGNED' then raise exception 'USE_COURIER_ACCEPT'; end if;
  if p_to <> 'CANCELLED' and o.payment_state not in ('NOT_REQUIRED','CONFIRMED') then
    raise exception 'PAYMENT_NOT_CONFIRMED';
  end if;

  update public.orders set status = p_to,
    accepted_at = case when p_to = 'ACCEPTED' then now() else accepted_at end,
    preparing_at = case when p_to = 'PREPARING' then now() else preparing_at end,
    ready_at = case when p_to = 'READY' then now() else ready_at end,
    picked_up_at = case when p_to = 'PICKED_UP' then now() else picked_up_at end,
    delivered_at = case when p_to = 'DELIVERED' then now() else delivered_at end,
    cancelled_at = case when p_to = 'CANCELLED' then now() else cancelled_at end,
    cancel_requested_at = case when p_to in ('CANCELLED','DELIVERED') then null else cancel_requested_at end,
    cancel_request_reason = case when p_to in ('CANCELLED','DELIVERED') then null else cancel_request_reason end
  where id = p_order;

  if p_note is not null then
    update public.order_status_history set note = left(p_note, 300)
    where id = (select max(id) from public.order_status_history where order_id = p_order);
  end if;
  if p_to = 'CANCELLED' then
    update public.courier_assignments set status = 'CANCELLED', responded_at = now()
    where order_id = p_order and status in ('OFFERED','ACCEPTED');
    if exists (select 1 from public.payments where order_id = p_order and status = 'PAID' and method <> 'CASH') then
      perform public.add_order_event(p_order, 'NOTE', 'Заказ был оплачен — нужен возврат клиенту');
    else
      update public.payments set status = 'FAILED' where order_id = p_order and status = 'PENDING';
    end if;
  elsif p_to = 'DELIVERED' then
    update public.courier_assignments set status = 'COMPLETED' where order_id = p_order and status = 'ACCEPTED';
    update public.payments set status = 'PAID', paid_at = now()
      where order_id = p_order and method = 'CASH' and status = 'PENDING';
  end if;
  return p_to;
end $$;

-- =====================================================================================
-- 7. cancel requests (kitchen -> back office)
-- =====================================================================================
create or replace function public.request_order_cancel(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders; v_uid uuid := auth.uid(); v_reason text := left(trim(coalesce(p_reason, '')), 300);
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(v_reason) < 3 then raise exception 'REASON_REQUIRED'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_admin() or o.branch_id in (select public.staff_branch_ids())) then raise exception 'FORBIDDEN'; end if;
  if o.status not in ('PENDING','ACCEPTED','PREPARING','READY','COURIER_ASSIGNED') then raise exception 'INVALID_TRANSITION'; end if;
  if o.cancel_requested_at is not null then raise exception 'ALREADY_REQUESTED'; end if;
  update public.orders set cancel_requested_at = now(), cancel_requested_by = v_uid, cancel_request_reason = v_reason
    where id = p_order;
  perform public.add_order_event(p_order, 'NOTE', 'Запрос отмены от кухни: ' || v_reason);
end $$;

create or replace function public.resolve_cancel_request(p_order uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders; v_note text := left(trim(coalesce(p_note, '')), 200);
begin
  if not public.is_backoffice() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if o.cancel_requested_at is null then raise exception 'NO_REQUEST'; end if;
  if p_approve then
    perform public.transition_order(p_order, 'CANCELLED',
      'Отмена по запросу кухни: ' || coalesce(o.cancel_request_reason, '') || case when v_note <> '' then ' · ' || v_note else '' end);
  else
    update public.orders set cancel_requested_at = null, cancel_request_reason = null, cancel_requested_by = null where id = p_order;
    perform public.add_order_event(p_order, 'NOTE', 'Запрос отмены отклонён' || case when v_note <> '' then ': ' || v_note else '' end);
  end if;
end $$;

-- =====================================================================================
-- 8. payments: receipt upload, review, refunds, expiry
-- =====================================================================================
create or replace function public.submit_payment_receipt(p_order uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders; v_uid uuid := auth.uid(); p public.payments;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into o from public.orders where id = p_order and user_id = v_uid for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if o.payment_method <> 'KASPI_QR' or o.status <> 'PENDING' or o.payment_state not in ('AWAITING_RECEIPT','REVIEW','REJECTED') then
    raise exception 'INVALID_PAYMENT_STATE';
  end if;
  if p_path is null or p_path !~ ('^' || v_uid::text || '/[A-Za-z0-9._-]{1,120}$') then raise exception 'BAD_RECEIPT_PATH'; end if;
  select * into p from public.payments where order_id = p_order for update;
  if p.attempts >= 10 then raise exception 'TOO_MANY_ATTEMPTS'; end if;
  update public.payments set receipt_path = p_path, receipt_uploaded_at = now(), attempts = attempts + 1,
    status = 'PENDING', reject_reason = null, reviewed_by = null, reviewed_by_name = null, reviewed_at = null
    where id = p.id;
  update public.orders set payment_state = 'REVIEW' where id = p_order;
  perform public.add_order_event(p_order, 'NOTE', 'Клиент загрузил чек об оплате');
end $$;

create or replace function public.review_payment(p_order uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders; v_uid uuid := auth.uid(); v_reason text := left(trim(coalesce(p_reason, '')), 300);
begin
  if not public.is_backoffice() then raise exception 'FORBIDDEN'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if o.payment_method <> 'KASPI_QR' or o.status <> 'PENDING' or o.payment_state not in ('AWAITING_RECEIPT','REVIEW','REJECTED') then
    raise exception 'INVALID_PAYMENT_STATE';
  end if;
  if p_approve then
    update public.payments set status = 'PAID', paid_at = now(), reviewed_by = v_uid, reviewed_by_name = public.person_name(v_uid),
      reviewed_at = now(), reject_reason = null where order_id = p_order;
    update public.orders set payment_state = 'CONFIRMED' where id = p_order;
    perform public.add_order_event(p_order, 'NOTE', 'Оплата подтверждена');
    if o.user_id is not null then
      insert into public.notifications(user_id, event, title, body, order_id)
      values (o.user_id, 'payment.confirmed', 'Оплата подтверждена', '#TB-' || o.order_no, p_order);
    end if;
  else
    if length(v_reason) < 3 then raise exception 'REASON_REQUIRED'; end if;
    update public.payments set status = 'FAILED', reviewed_by = v_uid, reviewed_by_name = public.person_name(v_uid),
      reviewed_at = now(), reject_reason = v_reason where order_id = p_order;
    update public.orders set payment_state = 'REJECTED' where id = p_order;
    perform public.add_order_event(p_order, 'NOTE', 'Оплата отклонена: ' || v_reason);
    if o.user_id is not null then
      insert into public.notifications(user_id, event, title, body, order_id)
      values (o.user_id, 'payment.rejected', 'Оплата не подтверждена', v_reason, p_order);
    end if;
  end if;
end $$;

create or replace function public.mark_payment_refunded(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_backoffice() then raise exception 'FORBIDDEN'; end if;
  update public.payments set status = 'REFUNDED'
    where order_id = p_order and status = 'PAID' and method <> 'CASH'
      and exists (select 1 from public.orders where id = p_order and status = 'CANCELLED');
  if not found then raise exception 'INVALID_PAYMENT_STATE'; end if;
  perform public.add_order_event(p_order, 'NOTE', 'Возврат клиенту выполнен');
end $$;

-- Cancels online orders whose payment never arrived (or was rejected and not fixed) within the timeout.
-- Orders with a receipt under review are never expired. Safe to call by any signed-in user.
create or replace function public.expire_unpaid_orders() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; v_min int;
begin
  select pay_timeout_min into v_min from public.payment_settings where id = 1;
  for r in
    select o.id from public.orders o join public.payments p on p.order_id = o.id
    where o.status = 'PENDING' and o.payment_state in ('AWAITING_RECEIPT','REJECTED')
      and coalesce(p.reviewed_at, o.created_at) < now() - make_interval(mins => v_min)
    for update of o skip locked
  loop
    update public.orders set status = 'CANCELLED', cancelled_at = now() where id = r.id;
    update public.payments set status = 'FAILED' where order_id = r.id and status in ('PENDING','FAILED');
    perform public.add_order_event(r.id, 'NOTE', 'Автоотмена: оплата не поступила вовремя');
    n := n + 1;
  end loop;
  return n;
end $$;

-- =====================================================================================
-- 9. offline (walk-in / counter) orders entered by branch staff
-- =====================================================================================
create or replace function public.create_offline_order(
  p_branch uuid, p_items jsonb, p_payment public.payment_method default 'CASH',
  p_name text default null, p_phone text default null, p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_order uuid; v_sub int := 0; v_item jsonb; v_prod record; v_qty int;
  v_extras jsonb; v_extra_sum int; v_unit int; v_lines jsonb := '[]';
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not (public.is_backoffice() or p_branch in (select public.staff_branch_ids())) then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.branches where id = p_branch and is_active) then raise exception 'BRANCH_UNAVAILABLE'; end if;
  if p_payment not in ('CASH','KASPI_QR','ONLINE') then raise exception 'PAYMENT_UNAVAILABLE'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then raise exception 'EMPTY_CART'; end if;
  if coalesce(trim(p_phone), '') <> '' and p_phone !~ '^\+7[0-9]{10}$' then raise exception 'BAD_PHONE'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::int;
    if v_qty is null or v_qty < 1 or v_qty > 50 then raise exception 'BAD_QUANTITY'; end if;
    select p.id, p.name, v.price_kzt, v.meat, p.extra_group_id into v_prod
    from public.products p
    join public.product_variants v on v.product_id = p.id and v.meat = (v_item->>'meat')::public.meat_type
    where p.id = (v_item->>'product_id')::uuid and p.is_active and v.is_active
      and not exists (select 1 from public.product_availability a
                      where a.branch_id = p_branch and a.product_id = p.id and not a.is_available);
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

  insert into public.orders(user_id, branch_id, mode, idempotency_key, contact_phone, customer_name, note,
    subtotal_kzt, discount_kzt, delivery_fee_kzt, total_kzt, payment_method, source, payment_state, placed_by,
    status, accepted_at)
  values (null, p_branch, 'PICKUP', gen_random_uuid()::text, coalesce(nullif(trim(p_phone), ''), '—'),
    coalesce(nullif(left(trim(p_name), 60), ''), 'Зал / касса'), left(p_note, 500),
    v_sub, 0, 0, v_sub, p_payment, 'OFFLINE', 'NOT_REQUIRED', v_uid, 'ACCEPTED', now())
  returning id into v_order;

  insert into public.order_items(order_id, product_id, product_name, meat, quantity, unit_price_kzt, extras, line_total_kzt)
  select v_order, (l->>'product_id')::uuid, l->>'name', (l->>'meat')::public.meat_type, (l->>'quantity')::int,
         (l->>'unit')::int, l->'extras', (l->>'unit')::int * (l->>'quantity')::int
  from jsonb_array_elements(v_lines) l;

  insert into public.payments(order_id, method, status, amount_kzt, provider, paid_at)
  values (v_order, p_payment, 'PAID', v_sub, 'offline', now());
  return v_order;
end $$;

-- =====================================================================================
-- 10. branches: create / delete (admin)
-- =====================================================================================
create or replace function public.admin_create_branch(
  p_name text, p_short_name text, p_address text,
  p_lat float8 default null, p_lon float8 default null,
  p_radius numeric default 8, p_fee int default 0, p_min int default 0
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_slug text; v_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or length(trim(coalesce(p_short_name, ''))) < 2 or length(trim(coalesce(p_address, ''))) < 5 then
    raise exception 'BAD_BRANCH';
  end if;
  if (p_lat is null) <> (p_lon is null) then raise exception 'BAD_BRANCH'; end if;
  v_slug := trim(both '-' from lower(regexp_replace(trim(p_short_name), '[^a-zA-Z0-9]+', '-', 'g')));
  if v_slug = '' or exists (select 1 from public.branches where slug = v_slug) then
    v_slug := coalesce(nullif(v_slug, ''), 'branch') || '-' || substr(gen_random_uuid()::text, 1, 6);
  end if;
  -- starts closed to orders: finish hours/coordinates, then enable "Принимает заказы"
  insert into public.branches(slug, name, short_name, address, lat, lon, coords_verified, delivery_radius_km,
    delivery_fee_kzt, min_order_kzt, is_active, accepts_orders, sort_order)
  values (v_slug, trim(p_name), trim(p_short_name), trim(p_address), p_lat, p_lon, false, p_radius, p_fee, p_min, true, false,
    coalesce((select max(sort_order) + 1 from public.branches), 0))
  returning id into v_id;
  insert into public.branch_working_hours(branch_id, day_of_week, open_time, close_time)
  select v_id, d, t.o, t.c from generate_series(0, 6) d,
    (values ('00:00'::time, '06:00'::time), ('08:00'::time, '00:00'::time)) as t(o, c);
  return v_id;
end $$;

create or replace function public.admin_delete_branch(p_branch uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if exists (select 1 from public.orders where branch_id = p_branch) then raise exception 'HAS_ORDERS'; end if;
  delete from public.branches where id = p_branch;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- =====================================================================================
-- 11. storage: private bucket for payment receipts
-- =====================================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','application/pdf'];

drop policy if exists receipts_insert_own on storage.objects;
create policy receipts_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists receipts_read on storage.objects;
create policy receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_backoffice()));

-- =====================================================================================
-- 12. privileges for the new functions
-- =====================================================================================
revoke execute on function
  public.orders_payment_gate(), public.payments_defaults(), public.payment_settings_touch(),
  public.request_order_cancel(uuid,text), public.resolve_cancel_request(uuid,boolean,text),
  public.submit_payment_receipt(uuid,text), public.review_payment(uuid,boolean,text), public.mark_payment_refunded(uuid),
  public.expire_unpaid_orders(),
  public.create_offline_order(uuid,jsonb,public.payment_method,text,text,text),
  public.admin_create_branch(text,text,text,float8,float8,numeric,int,int), public.admin_delete_branch(uuid)
  from public, anon, authenticated;
grant execute on function
  public.request_order_cancel(uuid,text), public.resolve_cancel_request(uuid,boolean,text),
  public.submit_payment_receipt(uuid,text), public.review_payment(uuid,boolean,text), public.mark_payment_refunded(uuid),
  public.expire_unpaid_orders(),
  public.create_offline_order(uuid,jsonb,public.payment_method,text,text,text),
  public.admin_create_branch(text,text,text,float8,float8,numeric,int,int), public.admin_delete_branch(uuid)
  to authenticated;
grant execute on all functions in schema public to service_role;
