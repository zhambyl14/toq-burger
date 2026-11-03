-- TOK BURGER: admin operations, audit log, staff invites.

alter table public.staff_invites enable row level security;
create policy staff_invites_admin on public.staff_invites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.is_admin());
grant select on public.audit_logs to authenticated;

-- ---------- audit trigger for admin-managed tables ----------
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (auth.uid(), lower(tg_op), tg_table_name, coalesce(v_row->>'id', v_row->>'product_id'),
          case when tg_op = 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)) else v_row end);
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['branches','branch_working_hours','products','product_variants','product_extras',
                           'product_availability','promotions','user_roles','couriers','staff_invites'] loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- ---------- staff management ----------
create or replace function public.admin_invite_staff(p_phone text, p_role public.user_role, p_branch uuid default null, p_name text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_role = 'CUSTOMER' then raise exception 'BAD_ROLE'; end if;
  if p_role in ('KITCHEN','OPERATOR') and p_branch is null then raise exception 'BRANCH_REQUIRED'; end if;
  insert into public.staff_invites(phone, role, branch_id, display_name)
    values (p_phone, p_role, case when p_role in ('KITCHEN','OPERATOR') then p_branch end, nullif(trim(p_name), ''))
    on conflict do nothing;
  select id into v_user from public.profiles where phone = p_phone;
  if v_user is not null then perform public.apply_staff_invites(v_user, p_phone); end if;
end $$;

create or replace function public.admin_revoke_staff(p_invite uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.staff_invites; v_user uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  delete from public.staff_invites where id = p_invite returning * into i;
  if not found then return; end if;
  select id into v_user from public.profiles where phone = i.phone;
  if v_user is null then return; end if;
  if v_user = auth.uid() and i.role = 'ADMIN' then raise exception 'CANNOT_REVOKE_SELF'; end if;
  delete from public.user_roles where user_id = v_user and role = i.role and branch_id is not distinct from i.branch_id;
  if i.role = 'COURIER' then update public.couriers set is_active = false, is_online = false where user_id = v_user; end if;
end $$;

create or replace function public.admin_set_courier_active(p_user uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  update public.couriers set is_active = p_active, is_online = case when p_active then is_online else false end where user_id = p_user;
end $$;

-- ---------- dashboard ----------
create or replace function public.admin_stats(p_from timestamptz, p_to timestamptz)
returns table (branch_id uuid, branch_name text, orders_total bigint, orders_delivered bigint,
               orders_cancelled bigint, revenue_kzt bigint, avg_check_kzt bigint)
language sql stable security definer set search_path = '' as $$
  select b.id, b.short_name,
    count(o.id), count(o.id) filter (where o.status = 'DELIVERED'), count(o.id) filter (where o.status = 'CANCELLED'),
    coalesce(sum(o.total_kzt) filter (where o.status = 'DELIVERED'), 0)::bigint,
    coalesce(avg(o.total_kzt) filter (where o.status = 'DELIVERED'), 0)::bigint
  from public.branches b
  left join public.orders o on o.branch_id = b.id and o.created_at >= p_from and o.created_at < p_to
  where public.is_admin()
  group by b.id, b.short_name, b.sort_order
  order by b.sort_order
$$;

-- promo preview for the cart (the real discount is recomputed in place_order)
create or replace function public.quote_promo(p_code text, p_subtotal int) returns int
language sql stable security definer set search_path = '' as $$
  select least(p_subtotal, coalesce(amount_off_kzt, (p_subtotal * percent_off) / 100))
  from public.promotions
  where code = upper(trim(p_code)) and is_active
    and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
    and (max_uses is null or used_count < max_uses) and p_subtotal >= min_subtotal_kzt
$$;
grant execute on function public.quote_promo(text,int) to anon, authenticated;

grant execute on function public.admin_invite_staff(text,public.user_role,uuid,text), public.admin_revoke_staff(uuid),
  public.admin_set_courier_active(uuid,boolean), public.admin_stats(timestamptz,timestamptz) to authenticated;
revoke execute on function public.audit_row(), public.apply_staff_invites(uuid,text) from public, anon, authenticated;

-- ---------- pre-authorized test/staff numbers (owner-provided) ----------
insert into public.staff_invites(phone, role, branch_id, display_name)
select '+77474005347', 'ADMIN'::public.user_role, null::uuid, 'Админ'
union all select '+77474005350', 'COURIER', null, 'Курьер (тест)'
union all select '+77474005348', r.role, b.id, 'Кухня (тест)'
  from public.branches b cross join (values ('KITCHEN'::public.user_role), ('OPERATOR'::public.user_role)) r(role);
