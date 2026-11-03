-- OTP: the 60 s resend cooldown applies only while the latest code is still unused.
-- After a successful login (code consumed) a new code may be issued immediately;
-- hourly limits (5 per phone, 20 per IP) still apply.
create or replace function public.otp_issue(p_phone text, p_hash text, p_ip inet, p_ttl_seconds int default 300)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('otp:' || p_phone));
  if exists (select 1 from public.whatsapp_otp_verifications
             where phone_number = p_phone and consumed_at is null and expires_at > now()
               and created_at > now() - interval '60 seconds') then
    return 'COOLDOWN';
  end if;
  if (select count(*) from public.whatsapp_otp_verifications
      where phone_number = p_phone and created_at > now() - interval '1 hour') >= 5
     or (p_ip is not null and (select count(*) from public.whatsapp_otp_verifications
      where request_ip = p_ip and created_at > now() - interval '1 hour') >= 20) then
    return 'RATE_LIMITED';
  end if;
  update public.whatsapp_otp_verifications set consumed_at = now()
    where phone_number = p_phone and consumed_at is null;
  insert into public.whatsapp_otp_verifications(phone_number, otp_hash, expires_at, request_ip)
  values (p_phone, p_hash, now() + make_interval(secs => p_ttl_seconds), p_ip);
  return 'OK';
end $$;

revoke execute on function public.otp_issue(text,text,inet,int) from public, anon, authenticated;
grant execute on function public.otp_issue(text,text,inet,int) to service_role;
