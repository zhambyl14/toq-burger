import 'server-only';
import { cacheLife } from 'next/cache';
import { supabasePublic } from '@/lib/supabase/admin';
import type { Catalog, Meat } from '@/types/catalog';

interface ProductRow {
  id: string; slug: string; name: string; tagline: string | null; description: string | null;
  ingredients: string[]; image_path: string | null; extra_group_id: string | null; sort_order: number; is_active: boolean;
  product_categories: { slug: string } | null;
  product_variants: { id: string; meat: Meat; label: string; price_kzt: number | null; nutrition: string | null; image_path: string | null; is_active: boolean }[];
}

/** Cached public catalog: admin edits appear within ~1 minute. */
export async function loadCatalog(): Promise<Catalog> {
  'use cache';
  cacheLife({ stale: 30, revalidate: 60, expire: 3600 });
  const db = supabasePublic();
  if (!db) return { configured: false, products: [], extras: [], branches: [], hours: [] };

  const [p, e, b, h] = await Promise.all([
    db.from('products')
      .select('id,slug,name,tagline,description,ingredients,image_path,extra_group_id,sort_order,is_active,product_categories(slug),product_variants(id,meat,label,price_kzt,nutrition,image_path,is_active)')
      .eq('is_active', true).order('sort_order'),
    db.from('product_extras').select('id,slug,name,price_kzt,group_id,sort_order').eq('is_active', true).order('sort_order'),
    db.from('branches').select('id,slug,name,short_name,address,map_url,lat,lon,coords_verified,delivery_radius_km,delivery_fee_kzt,min_order_kzt,is_active,accepts_orders').eq('is_active', true).order('sort_order'),
    db.from('branch_working_hours').select('branch_id,day_of_week,open_time,close_time'),
  ]);
  if (p.error || e.error || b.error || h.error) {
    return { configured: false, products: [], extras: [], branches: [], hours: [] };
  }

  return {
    configured: true,
    products: (p.data as unknown as ProductRow[]).map((r) => ({
      id: r.id, slug: r.slug, category: r.product_categories?.slug ?? 'other', name: r.name, tagline: r.tagline,
      description: r.description, ingredients: r.ingredients ?? [], image: r.image_path, extraGroupId: r.extra_group_id,
      variants: r.product_variants.filter((v) => v.is_active).sort((a, c) => (a.meat > c.meat ? 1 : -1))
        .map((v) => ({ id: v.id, meat: v.meat, label: v.label, price: v.price_kzt, nutrition: v.nutrition, image: v.image_path })),
    })),
    extras: e.data.map((x) => ({ id: x.id, slug: x.slug, name: x.name, price: x.price_kzt, groupId: x.group_id })),
    branches: b.data.map((x) => ({ ...x, delivery_radius_km: Number(x.delivery_radius_km) })),
    hours: h.data,
  };
}
