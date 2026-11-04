-- Kazakh content for the menu (Russian stays the default; kk falls back to ru when null/empty).
alter table public.products
  add column name_kk text,
  add column tagline_kk text,
  add column description_kk text,
  add column ingredients_kk text[] not null default '{}';
alter table public.product_variants
  add column label_kk text,
  add column nutrition_kk text;
alter table public.product_extras add column name_kk text;

-- products
update public.products set
  description_kk = 'Екі сиыр еті котлеті, еріген ірімшік, тұздалған қияр, салат және кунжут тоқашындағы фирмалық тұздық.',
  ingredients_kk = array['2 сиыр котлеті','Ірімшік','Қияр','Салат','Тұздық'] where slug = 'classic';
update public.products set
  tagline_kk = 'Жаңа бургер',
  description_kk = 'Қытырлақ тауық котлеті, коул-слоу, тұздалған қияр және ащы тұздық. Бургерге бал порциясы беріледі.',
  ingredients_kk = array['Қытырлақ тауық','Коул-слоу','Қияр','Тұздық','Бал порциясы'] where slug = 'champion';
update public.products set
  tagline_kk = 'Қыша қосылған',
  description_kk = 'Шырынды котлет, еріген ірімшік, қытырлақ қуырылған пияз және қыша тұздығы.',
  ingredients_kk = array['Котлет','Ірімшік','Қуырылған пияз','Қыша тұздығы'] where slug = 'mustard';
update public.products set
  description_kk = 'Котлет, қос еріген ірімшік, тұздалған қияр, салат және фирмалық тұздық.',
  ingredients_kk = array['Котлет','Қос ірімшік','Қияр','Салат','Тұздық'] where slug = 'double';
update public.products set
  tagline_kk = 'Ащы',
  description_kk = 'TOK BURGER-дің ащы бургері.',
  ingredients_kk = array['Котлет','Ащы тұздық'] where slug = 'hot';
update public.products set name_kk = 'Картоп фри' where slug = 'fries';
update public.products set name_kk = 'Наггетс', tagline_kk = '5 дана' where slug = 'nuggets';
update public.products set name_kk = 'Ірімшік тұздығы', tagline_kk = 'порция' where slug = 'cheese-sauce';
update public.products set name_kk = 'Coca-Cola Т/Б 0,5 л' where slug = 'cola-can';

-- variants
update public.product_variants set label_kk = 'Тауық' where meat = 'chicken';
update public.product_variants set label_kk = 'Сиыр еті' where meat = 'beef';
update public.product_variants set label_kk = '5 дана' where label = '5 шт.';
update public.product_variants set
  nutrition_kk = replace(replace(replace(nutrition, 'Б ', 'А '), 'Ж ', 'М '), 'У ', 'Ұ ')
where nutrition is not null;

-- extras
update public.product_extras set name_kk = 'Ірімшік тұздығы' where slug = 'cheese-sauce';
update public.product_extras set name_kk = 'Сиыр котлеті' where slug = 'beef-patty';
update public.product_extras set name_kk = 'Тауық котлеті' where slug = 'chicken-patty';
