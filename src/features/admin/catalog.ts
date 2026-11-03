'use client';
import { z } from 'zod';
import { sb } from '@/lib/supabase/client';
import type { Meat } from '@/types/catalog';

export interface AdminVariant { id: string; product_id: string; meat: Meat; label: string; price_kzt: number | null; nutrition: string | null; image_path: string | null; is_active: boolean }
export interface AdminProduct {
  id: string; slug: string; name: string; tagline: string | null; description: string | null; ingredients: string[];
  image_path: string | null; extra_group_id: string | null; is_active: boolean; sort_order: number; category_id: string;
  product_variants: AdminVariant[];
}
export interface AdminCategory { id: string; slug: string; name: string; sort_order: number }
export interface AdminExtra { id: string; group_id: string; slug: string; name: string; price_kzt: number; is_active: boolean; sort_order: number }

export const priceSchema = z.union([z.literal(''), z.string().regex(/^\d{1,7}$/, 'Только целое число ₸')]);

export const productSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название').max(80),
  tagline: z.string().trim().max(120),
  description: z.string().trim().max(1000),
  ingredients: z.string().max(500),
  sort_order: z.string().regex(/^-?\d{1,5}$/, 'Порядок — целое число'),
  category_id: z.string().uuid('Выберите категорию'),
});

export function slugify(s: string): string {
  const map: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya', қ: 'k', ә: 'a', ө: 'o', ұ: 'u', ү: 'u', ғ: 'g', ң: 'n', і: 'i', һ: 'h' };
  const base = s.toLowerCase().split('').map((c) => map[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return (base || 'item') + '-' + Math.random().toString(36).slice(2, 6);
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_INPUT_IMAGE = 8 * 1024 * 1024;
export const PHOTO_UPDATED_TOAST = 'Фото обновлено. На сайте появится в течение минуты';

/** Returns an error message, or null when the file can be opened in the editor. */
export function validateImageFile(file: File): string | null {
  const heic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  if (heic) return 'Формат HEIC не поддерживается. Сохраните фото как JPEG или PNG';
  if (!IMAGE_TYPES.includes(file.type)) return 'Только PNG, JPEG или WEBP';
  if (file.size > MAX_INPUT_IMAGE) return 'Файл больше 8 МБ';
  return null;
}

/** Uploads a processed image to Storage bucket product-images as products/<id>/<ts>.webp, returns the object path. */
export async function uploadProductImage(blob: Blob, productId: string): Promise<string> {
  const ext = blob.type === 'image/jpeg' ? 'jpg' : 'webp';
  const path = `products/${productId}/${Date.now()}.${ext}`;
  const { error } = await sb().storage.from('product-images').upload(path, blob, { contentType: blob.type || 'image/webp', cacheControl: '31536000' });
  if (error) throw new Error('Не удалось загрузить: ' + error.message);
  return path;
}

/** Best-effort removal of an old object; failure is reported but never blocks the caller. */
export async function removeProductImage(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { error } = await sb().storage.from('product-images').remove([path]);
  return error ? error.message : null;
}
