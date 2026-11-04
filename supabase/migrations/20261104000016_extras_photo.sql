-- Add-on items (extra patties, sauce…) get photos in Storage bucket 'product-images'.
alter table public.product_extras add column image_path text;
