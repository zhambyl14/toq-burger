import type { Extra, Meat, Product } from '@/types/catalog';

export interface CartLine {
  key: string;
  productId: string;
  meat: Meat;
  qty: number;
  extraIds: string[];
}

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

export function switchMeat(cart: CartLine[], key: string, meat: Meat): CartLine[] {
  const line = cart.find((c) => c.key === key);
  if (!line) return cart;
  return addLine(cart.filter((c) => c.key !== key), { productId: line.productId, meat, qty: line.qty, extraIds: line.extraIds });
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
