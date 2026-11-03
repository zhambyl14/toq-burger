-- Admin fixes: let admins change support request status (no customer update rights).
create policy support_admin_update on public.support_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant update (status) on public.support_requests to authenticated;
alter table public.support_requests add constraint support_status_chk
  check (status in ('OPEN','IN_PROGRESS','CLOSED')) not valid;
