-- Delivery assignment v2 (owner decision 2026-11-03):
--  * the customer's pin must be inside the Almaty city boundary (OSM relation 2465058, simplified);
--  * the NEAREST active branch that accepts orders and is open at the requested time is chosen;
--  * coordinate verification flag and per-branch radius no longer gate assignment.
-- Also: owner-approved test numbers are exempt from hourly OTP limits.

create table public.service_areas (
  id smallint primary key,
  name text not null,
  rings jsonb not null  -- [[[lon,lat],...], ...] outer rings
);
alter table public.service_areas enable row level security;
create policy service_areas_read on public.service_areas for select using (true);
create policy service_areas_admin on public.service_areas for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.service_areas to anon, authenticated;
grant insert, update, delete on public.service_areas to authenticated;
grant all on public.service_areas to service_role;

insert into public.service_areas(id, name, rings) values (1, 'Алматы (OSM 2465058)', '[[[76.74205,43.31488],[76.74836,43.30353],[76.75457,43.30445],[76.75467,43.29659],[76.78117,43.28911],[76.78535,43.28158],[76.79153,43.28884],[76.79835,43.28201],[76.79982,43.27434],[76.78671,43.26603],[76.79347,43.25036],[76.78922,43.25333],[76.77582,43.24949],[76.78646,43.23186],[76.76978,43.22973],[76.77261,43.22162],[76.77908,43.22242],[76.7804,43.21842],[76.77199,43.2151],[76.78,43.19789],[76.78218,43.20165],[76.7843,43.19626],[76.78962,43.19677],[76.79279,43.1752],[76.79328,43.16716],[76.7856,43.16432],[76.78881,43.16279],[76.77522,43.1596],[76.79837,43.15435],[76.7995,43.14642],[76.80842,43.14657],[76.80807,43.13574],[76.83565,43.1339],[76.83605,43.12208],[76.85026,43.12226],[76.8529,43.13471],[76.86287,43.13043],[76.86444,43.13329],[76.87056,43.12666],[76.89515,43.12609],[76.9007,43.08395],[76.90535,43.08015],[76.93703,43.08504],[76.96235,43.07781],[76.96761,43.06926],[76.96372,43.05923],[76.93678,43.04433],[76.94348,43.03377],[76.96652,43.04962],[76.98547,43.04337],[76.9938,43.04734],[77.02991,43.04314],[77.03243,43.03816],[77.05694,43.03284],[77.07715,43.0338],[77.08963,43.07094],[77.08003,43.10114],[77.08009,43.11539],[77.11372,43.10994],[77.12125,43.11743],[77.11323,43.11386],[77.07893,43.13204],[77.06294,43.14491],[77.06686,43.15138],[77.06023,43.16005],[77.07022,43.16484],[77.11707,43.15164],[77.12222,43.16684],[77.13489,43.16654],[77.14701,43.17816],[77.14596,43.18965],[77.13822,43.19809],[77.11965,43.20407],[77.11338,43.19926],[77.11398,43.18159],[77.09861,43.17605],[77.09685,43.18398],[77.06881,43.19693],[77.0575,43.22473],[77.03944,43.23407],[77.03217,43.24858],[77.00465,43.26269],[77.0064,43.26656],[77.01495,43.26641],[77.00993,43.29057],[77.01943,43.29308],[77.01822,43.29744],[77.04046,43.31031],[77.02629,43.31935],[77.04137,43.33787],[77.03186,43.34676],[77.04736,43.34868],[77.04472,43.35315],[77.06552,43.36224],[77.07476,43.36943],[77.10265,43.38287],[77.10238,43.38411],[77.07758,43.37135],[77.06799,43.37434],[77.04503,43.36292],[77.01154,43.35977],[77.01143,43.37953],[77.01629,43.38613],[77.00565,43.38845],[77.00879,43.39155],[77.00262,43.39322],[77.00273,43.3991],[76.98601,43.40377],[76.97909,43.3889],[76.9656,43.37985],[76.94128,43.38124],[76.93459,43.37661],[76.9292,43.37982],[76.92986,43.37372],[76.91683,43.35766],[76.89281,43.34472],[76.88031,43.32781],[76.8762,43.33013],[76.88001,43.34241],[76.8752,43.34653],[76.86579,43.3469],[76.85714,43.33323],[76.85173,43.3354],[76.85624,43.34343],[76.85057,43.34763],[76.85094,43.35404],[76.81209,43.35471],[76.80086,43.32939],[76.79074,43.32945],[76.77239,43.3165],[76.74205,43.31488]],[[77.12734,43.36453],[77.14168,43.34891],[77.14325,43.34258],[77.1391,43.34408],[77.13722,43.3395],[77.14635,43.33311],[77.16663,43.34485],[77.16057,43.35896],[77.15331,43.35791],[77.14224,43.36626],[77.14264,43.36244],[77.13169,43.3672],[77.12734,43.36453]]]'::jsonb);

-- ray casting point-in-polygon over all rings
create or replace function public.in_service_area(p_lat float8, p_lon float8) returns boolean
language plpgsql stable set search_path = '' as $$
declare ring jsonb; n int; i int; k int; xi float8; yi float8; xk float8; yk float8; inside boolean; any_area boolean := false;
begin
  for ring in select jsonb_array_elements(a.rings) from public.service_areas a loop
    any_area := true;
    n := jsonb_array_length(ring); inside := false; k := n - 1;
    for i in 0 .. n - 1 loop
      xi := (ring->i->>0)::float8; yi := (ring->i->>1)::float8;
      xk := (ring->k->>0)::float8; yk := (ring->k->>1)::float8;
      if ((yi > p_lat) <> (yk > p_lat)) and (p_lon < (xk - xi) * (p_lat - yi) / (yk - yi) + xi) then
        inside := not inside;
      end if;
      k := i;
    end loop;
    if inside then return true; end if;
  end loop;
  return not any_area; -- no area configured => no city restriction
end $$;
grant execute on function public.in_service_area(float8, float8) to anon, authenticated, service_role;

create or replace function public.find_delivery_branch(p_lat float8, p_lon float8, p_at timestamptz default now())
returns table (branch_id uuid, distance_km float8, delivery_fee_kzt int, nearest_any_km float8)
language sql stable set search_path = '' as $$
  with c as (
    select b.*, public.haversine_km(p_lat, p_lon, b.lat, b.lon) as d
    from public.branches b
    where b.is_active and b.lat is not null and b.lon is not null
  )
  select e.id, e.d, e.delivery_fee_kzt, (select min(d) from c)
  from c e
  where public.in_service_area(p_lat, p_lon)
    and e.accepts_orders and public.branch_is_open(e.id, p_at)
  order by e.d
  limit 1
$$;

-- OTP: optional exemption from hourly limits (used only for TEST_OTP_PHONES by the server)
drop function public.otp_issue(text, text, inet, int);
create function public.otp_issue(p_phone text, p_hash text, p_ip inet, p_ttl_seconds int default 300, p_skip_limits boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('otp:' || p_phone));
  if exists (select 1 from public.whatsapp_otp_verifications
             where phone_number = p_phone and consumed_at is null and expires_at > now()
               and created_at > now() - interval '60 seconds') then
    return 'COOLDOWN';
  end if;
  if not p_skip_limits and (
       (select count(*) from public.whatsapp_otp_verifications
        where phone_number = p_phone and created_at > now() - interval '1 hour') >= 5
    or (p_ip is not null and (select count(*) from public.whatsapp_otp_verifications
        where request_ip = p_ip and created_at > now() - interval '1 hour') >= 20)) then
    return 'RATE_LIMITED';
  end if;
  update public.whatsapp_otp_verifications set consumed_at = now()
    where phone_number = p_phone and consumed_at is null;
  insert into public.whatsapp_otp_verifications(phone_number, otp_hash, expires_at, request_ip)
  values (p_phone, p_hash, now() + make_interval(secs => p_ttl_seconds), p_ip);
  return 'OK';
end $$;
revoke execute on function public.otp_issue(text, text, inet, int, boolean) from public, anon, authenticated;
grant execute on function public.otp_issue(text, text, inet, int, boolean) to service_role;

-- unblock the owner's test numbers right now
delete from public.whatsapp_otp_verifications
where phone_number in ('+77474005347', '+77474005348', '+77474005349', '+77474005350');
