import type { Extra, Meat, Product } from '@/types/catalog';

export interface CartLine {
  key: string;
  productId: string;
  meat: Meat;
  qty: number;
  extraIds: string[];
}

/** Extras slugs of the burger add-ons. The cheese slug is historical ('cheese-sauce'); it is an extra cheese, never a sauce. */
export const BEEF_PATTY_SLUG = 'beef-patty';
export const CHICKEN_PATTY_SLUG = 'chicken-patty';
export const CHEESE_EXTRA_SLUG = 'cheese-sauce';
const PATTY_SLUGS: readonly string[] = [BEEF_PATTY_SLUG, CHICKEN_PATTY_SLUG];

export function lineKey(productId: string, meat: Meat, extraIds: string[]): string {
  return `${productId}|${meat}|${[...extraIds].sort().join(',')}`;
}

/** Display price only. The authoritative total is computed in the database (place_order). */
export function unitPrice(product: Product | undefined, meat: Meat, extraIds: string[], extras: Extra[]): number | null {
  const v = product?.variants.find((x) => x.meat === meat);
  if (!v || v.price == null) return null;
  let sum = v.price;
  for (const id of extraIds) {
    const e = extras.find((x) => x.id === id);
    if (!e || e.groupId !== product?.extraGroupId) return null;
    sum += e.price;
  }
  return sum;
}

export function addLine(cart: CartLine[], item: Omit<CartLine, 'key'>): CartLine[] {
  const key = lineKey(item.productId, item.meat, item.extraIds);
  const found = cart.find((c) => c.key === key);
  if (found) return cart.map((c) => (c.key === key ? { ...c, qty: Math.min(50, c.qty + item.qty) } : c));
  return [...cart, { ...item, key, qty: Math.min(50, item.qty) }];
}

export function changeQty(cart: CartLine[], key: string, delta: number): CartLine[] {
  return cart.map((c) => (c.key === key ? { ...c, qty: Math.min(50, c.qty + delta) } : c)).filter((c) => c.qty > 0);
}

/** Slug of the extra patty that matches the meat (null for items without a meat choice). */
export function pattySlugFor(meat: Meat): string | null {
  return meat === 'beef' ? BEEF_PATTY_SLUG : meat === 'chicken' ? CHICKEN_PATTY_SLUG : null;
}

/** The extra patty for the meat; when groupId is given only extras of that group are considered. */
export function pattyExtraFor(meat: Meat, extras: Extra[], groupId?: string | null): Extra | undefined {
  const slug = pattySlugFor(meat);
  if (!slug) return undefined;
  return extras.find((e) => e.slug === slug && (groupId == null || e.groupId === groupId));
}

/**
 * When the meat changes, the selected extra patty follows it (beef patty <-> chicken patty).
 * Other extras are untouched; without a patty in the selection nothing changes.
 * If the catalog has no patty for the new meat, the selection is returned as is (the line stays valid and priced).
 */
export function swapPattyExtra(extraIds: string[], meat: Meat, extras: Extra[]): string[] {
  const isPatty = (id: string) => PATTY_SLUGS.includes(extras.find((e) => e.id === id)?.slug ?? '');
  const old = extraIds.find(isPatty);
  if (old == null) return extraIds;
  const groupId = extras.find((e) => e.id === old)?.groupId;
  const target = pattyExtraFor(meat, extras, groupId);
  if (!target) return extraIds;
  return [...extraIds.filter((id) => !isPatty(id)), target.id];
}

/** Switches the meat of a line; with `extras` the extra patty is swapped to the new meat's patty. */
export function switchMeat(cart: CartLine[], key: string, meat: Meat, extras?: Extra[]): CartLine[] {
  const line = cart.find((c) => c.key === key);
  if (!line) return cart;
  const extraIds = extras ? swapPattyExtra(line.extraIds, meat, extras) : line.extraIds;
  return addLine(cart.filter((c) => c.key !== key), { productId: line.productId, meat, qty: line.qty, extraIds });
}

/** Replaces a line with a new configuration (cart «edit»): old key removed, new one added with addLine merge semantics. */
export function replaceLine(cart: CartLine[], oldKey: string, item: Omit<CartLine, 'key'>): CartLine[] {
  return addLine(cart.filter((c) => c.key !== oldKey), item);
}

/** «Add to order» offers: fries and nuggets (sides) and the drinks. Never sauces or anything else. */
export function upsellProducts(products: Product[], excludeId?: string): { sides: Product[]; drinks: Product[] } {
  const others = products.filter((p) => p.id !== excludeId);
  return { sides: others.filter((p) => p.category === 'sides'), drinks: others.filter((p) => p.category === 'drinks') };
}

export function cartTotals(cart: CartLine[], products: Product[], extras: Extra[], deliveryFee: number) {
  let subtotal = 0;
  let unavailable = 0;
  for (const l of cart) {
    const u = unitPrice(products.find((p) => p.id === l.productId), l.meat, l.extraIds, extras);
    if (u == null) unavailable++;
    else subtotal += u * l.qty;
  }
  return { subtotal, deliveryFee, total: subtotal + deliveryFee, unavailable, count: cart.reduce((s, l) => s + l.qty, 0) };
}
