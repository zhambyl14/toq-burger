import 'server-only';
import { supabasePublic } from '@/lib/supabase/admin';
import type { Catalog, Meat } from '@/types/catalog';

interface ProductRow {
  id: string; slug: string; name: string; name_kk: string | null; tagline: string | null; tagline_kk: string | null; description: string | null; description_kk: string | null;
  ingredients: string[]; ingredients_kk: string[] | null; image_path: string | null; extra_group_id: string | null; sort_order: number; is_active: boolean;
  product_categories: { slug: string } | null;
  product_variants: { id: string; meat: Meat; label: string; label_kk: string | null; price_kzt: number | null; nutrition: string | null; nutrition_kk: string | null; image_path: string | null; is_active: boolean }[];
}

// Per-isolate memory cache: keeps Supabase load low; admin edits appear within ~30 s.
const TTL_MS = 30_000;
let memo: { at: number; data: Catalog } | null = null;

export async function loadCatalog(): Promise<Catalog> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.data;
  const data = await fetchCatalog();
  if (data.configured) memo = { at: Date.now(), data };
  return data;
}

async function fetchCatalog(): Promise<Catalog> {
  const db = supabasePublic();
  if (!db) return { configured: false, products: [], extras: [], branches: [], hours: [], area: [] };

  const [p, e, b, h, a] = await Promise.all([
    db.from('products')
      .select('id,slug,name,name_kk,tagline,tagline_kk,description,description_kk,ingredients,ingredients_kk,image_path,extra_group_id,sort_order,is_active,product_categories(slug),product_variants(id,meat,label,label_kk,price_kzt,nutrition,nutrition_kk,image_path,is_active)')
      .eq('is_active', true).order('sort_order'),
    db.from('product_extras').select('id,slug,name,name_kk,image_path,price_kzt,group_id,sort_order').eq('is_active', true).order('sort_order'),
    db.from('branches').select('id,slug,name,short_name,address,map_url,lat,lon,coords_verified,delivery_radius_km,delivery_fee_kzt,min_order_kzt,is_active,accepts_orders').eq('is_active', true).order('sort_order'),
    db.from('branch_working_hours').select('branch_id,day_of_week,open_time,close_time'),
    db.from('service_areas').select('rings'),
  ]);
  if (p.error || e.error || b.error || h.error || a.error) {
    return { configured: false, products: [], extras: [], branches: [], hours: [], area: [] };
  }

  return {
    configured: true,
    products: (p.data as unknown as ProductRow[]).map((r) => ({
      id: r.id, slug: r.slug, category: r.product_categories?.slug ?? 'other', name: r.name, nameKk: r.name_kk, tagline: r.tagline, taglineKk: r.tagline_kk,
      description: r.description, descriptionKk: r.description_kk, ingredients: r.ingredients ?? [], ingredientsKk: r.ingredients_kk ?? [], image: r.image_path, extraGroupId: r.extra_group_id,
      variants: r.product_variants.filter((v) => v.is_active).sort((a, c) => (a.meat > c.meat ? 1 : -1))
        .map((v) => ({ id: v.id, meat: v.meat, label: v.label, labelKk: v.label_kk, price: v.price_kzt, nutrition: v.nutrition, nutritionKk: v.nutrition_kk, image: v.image_path })),
    })),
    extras: e.data.map((x) => ({ id: x.id, slug: x.slug, name: x.name, nameKk: x.name_kk, image: x.image_path, price: x.price_kzt, groupId: x.group_id })),
    branches: b.data.map((x) => ({ ...x, delivery_radius_km: Number(x.delivery_radius_km) })),
    hours: h.data,
    area: (a.data ?? []).flatMap((r) => r.rings as [number, number][][]),
  };
}
