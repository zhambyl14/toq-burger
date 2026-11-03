-- TOK BURGER: Row Level Security. Writes to orders/status/assignments go only through security-definer functions.

do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- OTP table: no policies at all + no grants => invisible to anon/authenticated.
revoke all on public.whatsapp_otp_verifications from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;

-- ---------- public catalog (read for everyone, write admin) ----------
do $$ declare t text; begin
  foreach t in array array['branches','branch_working_hours','product_categories','products','product_variants',
                           'product_extra_groups','product_extras','product_availability'] loop
    execute format('create policy "%1$s_read" on public.%1$I for select using (true)', t);
    execute format('create policy "%1$s_admin" on public.%1$I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;
-- branch staff may toggle availability (stop-list) for their own branch
create policy availability_staff on public.product_availability for all to authenticated
  using (branch_id in (select public.staff_branch_ids()))
  with check (branch_id in (select public.staff_branch_ids()));

create policy promotions_admin on public.promotions for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- codes are not enumerable by customers: validated only inside place_order.

-- ---------- profiles / roles ----------
create policy profiles_self_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name, notifications_enabled) on public.profiles to authenticated;

create policy roles_read on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy roles_admin on public.user_roles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- customer-owned data ----------
create policy addresses_own on public.customer_addresses for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy carts_own on public.carts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cart_items_own on public.cart_items for all to authenticated
  using (cart_id in (select id from public.carts where user_id = auth.uid()))
  with check (cart_id in (select id from public.carts where user_id = auth.uid()));
create policy favorites_own on public.favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy loyalty_read on public.loyalty_accounts for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy loyalty_tx_read on public.loyalty_transactions for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy notifications_own_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_own_mark on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy support_own on public.support_requests for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy support_insert on public.support_requests for insert to authenticated with check (user_id = auth.uid());

-- ---------- orders: read-only via RLS ----------
create or replace function public.can_see_order(p_order uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.orders o where o.id = p_order and (
    o.user_id = auth.uid() or public.is_admin()
    or o.branch_id in (select public.staff_branch_ids())
    or (o.courier_id = auth.uid())))
$$;
grant execute on function public.can_see_order(uuid) to authenticated;

create policy orders_read on public.orders for select to authenticated using (
  user_id = auth.uid() or public.is_admin()
  or branch_id in (select public.staff_branch_ids())
  or courier_id = auth.uid()
  -- couriers can preview READY delivery orders on offer
  or (status = 'READY' and mode = 'DELIVERY' and courier_id is null and public.has_role('COURIER')));
create policy order_items_read on public.order_items for select to authenticated using (
  public.can_see_order(order_id)
  or exists (select 1 from public.orders o where o.id = order_id and o.status = 'READY' and o.courier_id is null and public.has_role('COURIER')));
create policy history_read on public.order_status_history for select to authenticated using (public.can_see_order(order_id));
create policy payments_read on public.payments for select to authenticated using (public.can_see_order(order_id));

create policy couriers_read on public.couriers for select to authenticated using (user_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.orders o where o.courier_id = couriers.user_id and o.user_id = auth.uid()
             and o.status in ('COURIER_ASSIGNED','PICKED_UP','ON_THE_WAY'))
  or exists (select 1 from public.orders o where o.courier_id = couriers.user_id and o.branch_id in (select public.staff_branch_ids())));
create policy couriers_admin on public.couriers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy couriers_self_online on public.couriers for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.couriers from authenticated;
grant update (is_online) on public.couriers to authenticated;
grant update on public.couriers to service_role;

create policy assignments_read on public.courier_assignments for select to authenticated
  using (courier_id = auth.uid() or public.can_see_order(order_id));

-- courier location: courier self, admin, or the customer of an ACTIVE delivery by that courier
create policy courier_loc_read on public.courier_locations for select to authenticated using (
  courier_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.orders o where o.courier_id = courier_locations.courier_id
             and o.user_id = auth.uid() and o.status in ('PICKED_UP','ON_THE_WAY')));

-- ---------- realtime ----------
alter publication supabase_realtime add table public.orders, public.order_status_history, public.courier_locations;

-- ---------- storage: product images ----------
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
  on conflict (id) do nothing;
create policy product_images_read on storage.objects for select using (bucket_id = 'product-images');
create policy product_images_admin_write on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());
create policy product_images_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
create policy product_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
