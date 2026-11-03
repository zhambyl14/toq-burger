-- TOK BURGER: real menu + branches (data supplied by the owner / approved design).
-- Drink prices are unknown => price_kzt NULL (shown as "Цена уточняется", not orderable).
-- Branch coordinates come from the approved design and are NOT yet verified:
-- coords_verified=false disables automatic delivery assignment until an admin confirms them
-- (Admin → Филиалы → "Координаты проверены").

insert into public.product_categories(slug, name, sort_order) values
  ('burgers', 'Бургеры', 1), ('sides', 'Картофель и закуски', 2), ('sauces', 'Соусы', 3),
  ('drinks', 'Напитки', 4), ('combo', 'Комбо', 5);

insert into public.product_extra_groups(id, name) values ('00000000-0000-4000-8000-0000000000e1', 'Дополнительно к бургеру');
insert into public.product_extras(group_id, slug, name, price_kzt, sort_order) values
  ('00000000-0000-4000-8000-0000000000e1', 'cheese-sauce', 'Сырный соус', 200, 1),
  ('00000000-0000-4000-8000-0000000000e1', 'beef-patty', 'Котлета говяжья', 790, 2),
  ('00000000-0000-4000-8000-0000000000e1', 'chicken-patty', 'Котлета куриная', 690, 3);

with c as (select id, slug from public.product_categories)
insert into public.products(slug, category_id, name, tagline, description, ingredients, image_path, extra_group_id, sort_order)
select v.slug, (select id from c where c.slug = v.cat), v.name, v.tag, v.descr, v.ing, v.img,
       case when v.cat = 'burgers' then '00000000-0000-4000-8000-0000000000e1'::uuid end, v.ord
from (values
  ('classic','burgers','NEW CLASSIC','Жаңа классика · Новая классика','Две говяжьи котлеты, бекон, расплавленный сыр, маринованные огурцы, салат и фирменный соус на булочке с кунжутом.', array['2 говяжьи котлеты','Бекон','Сыр','Огурцы','Салат','Соус'], 'classic.png', 1),
  ('champion','burgers','CHAMPION','New burger','Хрустящая куриная котлета, коул-слоу, маринованные огурцы и острый соус. К бургеру — порция мёда.', array['Хрустящая курица','Коул-слоу','Огурцы','Соус','Порция мёда'], 'champion.png', 2),
  ('mustard','burgers','MUSTARD','С горчицей','Сочная котлета, расплавленный сыр, хрустящий жареный лук и горчичный соус.', array['Котлета','Сыр','Жареный лук','Горчичный соус'], 'mustard-beef.png', 3),
  ('double','burgers','DOUBLE CHEESE','Екі ірімшікті · Двойной сыр','Котлета, двойной плавленый сыр, маринованные огурцы, салат и фирменный соус.', array['Котлета','Двойной сыр','Огурцы','Салат','Соус'], 'double-beef.png', 4),
  ('hot','burgers','HOT BURGER','Острый','Острый бургер TOK BURGER.', array['Котлета','Острый соус'], 'double-beef.png', 5),
  ('fries','sides','Картофель фри','100 г',null, '{}'::text[], 'fries.png', 10),
  ('nuggets','sides','Наггетсы','5 шт.',null, '{}'::text[], 'nuggets.png', 11),
  ('cheese-sauce','sauces','Сырный соус','порция',null, '{}'::text[], null, 20),
  ('cola','drinks','Coca-Cola 0,5 л',null,null, '{}'::text[], 'cola.png', 30),
  ('cola-can','drinks','Coca-Cola Ж/Б 0,5 л',null,null, '{}'::text[], 'cola-can.png', 31),
  ('fanta','drinks','Fanta 0,5 л',null,null, '{}'::text[], 'fanta.png', 32),
  ('sprite','drinks','Sprite 0,5 л',null,null, '{}'::text[], 'sprite.png', 33),
  ('fuse','drinks','Fuse Tea 0,5 л',null,null, '{}'::text[], 'fuse.png', 34),
  ('bonaqua','drinks','Bonaqua 0,5 л',null,null, '{}'::text[], 'bonaqua.png', 35)
) as v(slug, cat, name, tag, descr, ing, img, ord);

insert into public.product_variants(product_id, meat, label, price_kzt, nutrition, image_path)
select p.id, v.meat::public.meat_type, v.label, v.price, v.kcal, v.img
from (values
  ('classic','beef','Говядина',2290,'Б 41 · Ж 62 · У 53 · 934 ккал','classic.png'),
  ('champion','chicken','Курица',2290,'Б 33 · Ж 33 · У 46 · 619 ккал','champion.png'),
  ('mustard','chicken','Курица',1900,'Б 34 · Ж 34 · У 41 · 617 ккал','mustard-chicken.png'),
  ('mustard','beef','Говядина',2190,'Б 30 · Ж 46 · У 41 · 702 ккал','mustard-beef.png'),
  ('double','chicken','Курица',2190,'Б 39 · Ж 36 · У 42 · 655 ккал','double-chicken.png'),
  ('double','beef','Говядина',2290,'Б 36 · Ж 48 · У 42 · 740 ккал','double-beef.png'),
  ('hot','chicken','Курица',1900,null,'double-chicken.png'),
  ('hot','beef','Говядина',2190,null,'double-beef.png'),
  ('fries','one','100 г',695,null,null),
  ('nuggets','one','5 шт.',795,null,null),
  ('cheese-sauce','one','порция',200,null,null),
  ('cola','one','0,5 л',null,null,null),
  ('cola-can','one','0,5 л',null,null,null),
  ('fanta','one','0,5 л',null,null,null),
  ('sprite','one','0,5 л',null,null,null),
  ('fuse','one','0,5 л',null,null,null),
  ('bonaqua','one','0,5 л',null,null,null)
) as v(slug, meat, label, price, kcal, img)
join public.products p on p.slug = v.slug;

insert into public.branches(slug, name, short_name, address, map_url, lat, lon, coords_verified, sort_order) values
  ('samal','TOK BURGER — Samal','Самал-3','Микрорайон Самал-3, 4д, Медеуский район, Алматы','https://go.2gis.com/hMAHi', 43.228069, 76.960213, false, 1),
  ('rad','TOK BURGER — Radostovtsa','Радостовца','Улица Радостовца, 293/5, Бостандыкский район, Алматы','https://go.2gis.com/o0x0p', 43.206991, 76.896668, false, 2),
  ('zhar','TOK BURGER — Zharokova','Жарокова','Улица Жарокова, 289а, Бостандыкский район, Алматы','https://go.2gis.com/hjmyf', 43.211785, 76.902073, false, 3),
  ('tole','TOK BURGER — Tole Bi','Толе би','Улица Толе би, 233/2, Тастак-3, Алмалинский район, Алматы','https://go.2gis.com/NW1jK', 43.250623, 76.879649, false, 4);

-- 00:00–24:00 with a break 06:00–08:00 => windows 00:00–06:00 and 08:00–24:00 (close 00:00 = midnight)
insert into public.branch_working_hours(branch_id, day_of_week, open_time, close_time)
select b.id, d, w.o, w.c from public.branches b
cross join generate_series(0, 6) d
cross join (values ('00:00'::time, '06:00'::time), ('08:00'::time, '00:00'::time)) w(o, c);
