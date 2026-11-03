-- Admin dashboard aggregates + atomic working-hours replacement.

create or replace function public.admin_top_items(p_from timestamptz, p_to timestamptz, p_branch uuid default null)
returns table (product_name text, qty bigint, revenue_kzt bigint)
language sql stable security definer set search_path = '' as $$
  select i.product_name, sum(i.quantity)::bigint, sum(i.line_total_kzt)::bigint
  from public.order_items i
  join public.orders o on o.id = i.order_id
  where public.is_admin()
    and o.status = 'DELIVERED'
    and o.created_at >= p_from and o.created_at < p_to
    and (p_branch is null or o.branch_id = p_branch)
  group by i.product_name
  order by sum(i.quantity) desc, i.product_name
  limit 50
$$;

create or replace function public.admin_orders_by_hour(p_from timestamptz, p_to timestamptz, p_branch uuid default null)
returns table (hour int, orders bigint)
language sql stable security definer set search_path = '' as $$
  select extract(hour from o.created_at at time zone 'Asia/Almaty')::int, count(*)::bigint
  from public.orders o
  where public.is_admin()
    and o.created_at >= p_from and o.created_at < p_to
    and (p_branch is null or o.branch_id = p_branch)
  group by 1
  order by 1
$$;

create or replace function public.admin_set_branch_hours(p_branch uuid, p_rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_day int; v_open time; v_close time;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'BAD_ROWS'; end if;
  if not exists (select 1 from public.branches where id = p_branch) then raise exception 'BRANCH_NOT_FOUND'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      v_day := (r->>'day_of_week')::int;
      v_open := (r->>'open_time')::time;
      v_close := (r->>'close_time')::time;
    exception when others then
      raise exception 'BAD_ROWS';
    end;
    if v_day is null or v_day not between 0 and 6 or v_open is null or v_close is null then raise exception 'BAD_ROWS'; end if;
    if v_close <> time '00:00' and v_close <= v_open then raise exception 'BAD_TIME_RANGE'; end if;
  end loop;
  delete from public.branch_working_hours where branch_id = p_branch;
  insert into public.branch_working_hours(branch_id, day_of_week, open_time, close_time)
  select p_branch, (e->>'day_of_week')::smallint, (e->>'open_time')::time, (e->>'close_time')::time
  from jsonb_array_elements(p_rows) e;
end $$;

revoke all on function public.admin_top_items(timestamptz, timestamptz, uuid) from public, anon;
revoke all on function public.admin_orders_by_hour(timestamptz, timestamptz, uuid) from public, anon;
revoke all on function public.admin_set_branch_hours(uuid, jsonb) from public, anon;
grant execute on function public.admin_top_items(timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.admin_orders_by_hour(timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.admin_set_branch_hours(uuid, jsonb) to authenticated;
