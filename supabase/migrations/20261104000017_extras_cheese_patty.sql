-- Owner decision (2026-11-04): "Сырный соус" is NOT a sauce — it is extra cheese added to a patty and is never
-- sold on its own. Add-ons for burgers are: extra patty (price depends on the meat) and extra cheese.

update public.product_extras set
  name = 'Дополнительный сыр', name_kk = 'Қосымша ірімшік', sort_order = 3
where slug = 'cheese-sauce';
update public.product_extras set
  name = 'Дополнительная котлета (говядина)', name_kk = 'Қосымша котлет (сиыр еті)', sort_order = 1
where slug = 'beef-patty';
update public.product_extras set
  name = 'Дополнительная котлета (курица)', name_kk = 'Қосымша котлет (тауық еті)', sort_order = 2
where slug = 'chicken-patty';

-- the stand-alone product "Сырный соус" disappears from the menu (kept inactive for history)
update public.products set is_active = false where slug = 'cheese-sauce';
