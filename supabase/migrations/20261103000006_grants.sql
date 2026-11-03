-- Explicit Data API privileges (new Supabase projects do not auto-grant). RLS still filters rows.

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- public catalog
grant select on public.branches, public.branch_working_hours, public.product_categories, public.products,
  public.product_variants, public.product_extra_groups, public.product_extras, public.product_availability
  to anon, authenticated;
-- admin writes to catalog (RLS: is_admin; availability also branch staff)
grant insert, update, delete on public.branches, public.branch_working_hours, public.product_categories, public.products,
  public.product_variants, public.product_extra_groups, public.product_extras, public.product_availability,
  public.promotions, public.staff_invites
  to authenticated;
grant select on public.promotions, public.staff_invites, public.user_roles, public.audit_logs to authenticated;
grant insert, update, delete on public.user_roles to authenticated;

-- customer-owned
grant select on public.profiles to authenticated;            -- update limited to columns in 0003
grant select, insert, update, delete on public.customer_addresses, public.carts, public.cart_items, public.favorites to authenticated;
grant select on public.loyalty_accounts, public.loyalty_transactions to authenticated;
grant select, update on public.notifications to authenticated;
grant select, insert on public.support_requests to authenticated;

-- orders: read only (writes via security-definer functions)
grant select on public.orders, public.order_items, public.order_status_history, public.payments,
  public.couriers, public.courier_assignments, public.courier_locations to authenticated;
grant insert, delete on public.couriers to authenticated;   -- admin only via RLS

-- never exposed
revoke all on public.whatsapp_otp_verifications from anon, authenticated;

grant execute on function public.apply_staff_invites(uuid, text) to service_role;
grant execute on all functions in schema public to service_role;
