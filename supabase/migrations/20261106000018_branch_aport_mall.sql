-- 5th branch: Aport Mall (Tashkent highway, Karasai district). Coordinates taken from the 2GIS link.
insert into public.branches(slug, name, short_name, address, map_url, lat, lon, coords_verified, sort_order) values
  ('aport','TOK BURGER — Aport Mall','Апорт Молл','Ташкентский тракт, 17к (ТРЦ Апорт Молл), Карасайский район, Алматы','https://go.2gis.com/5oHpS', 43.233612, 76.778279, true, 5);

-- same schedule as the other branches: 00:00–06:00 and 08:00–24:00
insert into public.branch_working_hours(branch_id, day_of_week, open_time, close_time)
select b.id, d, w.o, w.c from public.branches b
cross join generate_series(0, 6) d
cross join (values ('00:00'::time, '06:00'::time), ('08:00'::time, '00:00'::time)) w(o, c)
where b.slug = 'aport';
