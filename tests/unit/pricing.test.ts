import { describe, expect, it } from 'vitest';
import { addLine, cartTotals, changeQty, lineKey, pattyExtraFor, replaceLine, switchMeat, swapPattyExtra, unitPrice, upsellProducts } from '@/features/cart/pricing';
import { haversineKm, inServiceArea, isBranchOpen, pickDeliveryBranch, type Ring } from '@/features/branches/assign';
import almatyRings from './almaty-rings.json';
import { normalizeKzPhone, internalEmailFor, maskPhone } from '@/lib/phone';
import type { Branch, Extra, Hours, Product } from '@/types/catalog';

const mustard: Product = {
  id: 'm', slug: 'mustard', category: 'burgers', name: 'MUSTARD', tagline: null, description: null, ingredients: [], image: null, extraGroupId: 'g',
  variants: [
    { id: 'mc', meat: 'chicken', label: 'Курица', price: 1900, nutrition: null, image: null },
    { id: 'mb', meat: 'beef', label: 'Говядина', price: 2190, nutrition: null, image: null },
  ],
};
const fanta: Product = { ...mustard, id: 'f', slug: 'fanta', category: 'drinks', variants: [{ id: 'f1', meat: 'one', label: '0,5', price: null, nutrition: null, image: null }] };
const extras: Extra[] = [
  { id: 'cs', slug: 'cheese-sauce', name: 'Дополнительный сыр', price: 200, groupId: 'g' },
  { id: 'bp', slug: 'beef-patty', name: 'Дополнительная котлета (говядина)', price: 790, groupId: 'g' },
  { id: 'cp', slug: 'chicken-patty', name: 'Дополнительная котлета (курица)', price: 690, groupId: 'g' },
];

const prod = (id: string, category: string, slug = id): Product => ({ ...mustard, id, slug, category });

describe('pricing', () => {
  it('chicken/beef price differs', () => {
    expect(unitPrice(mustard, 'chicken', [], extras)).toBe(1900);
    expect(unitPrice(mustard, 'beef', [], extras)).toBe(2190);
  });
  it('extras add to unit price', () => {
    expect(unitPrice(mustard, 'beef', ['cs', 'bp'], extras)).toBe(2190 + 200 + 790);
  });
  it('unpriced product is not orderable', () => {
    expect(unitPrice(fanta, 'one', [], extras)).toBeNull();
  });
  it('missing or foreign-group extra makes line unavailable', () => {
    expect(unitPrice(mustard, 'beef', ['nope'], extras)).toBeNull();
    const foreign: Extra[] = [{ id: 'x', slug: 'x', name: 'X', price: 100, groupId: 'other' }];
    expect(unitPrice(mustard, 'beef', ['x'], foreign)).toBeNull();
  });
  it('same configuration merges, extras order irrelevant', () => {
    let c = addLine([], { productId: 'm', meat: 'beef', qty: 1, extraIds: ['cs', 'bp'] });
    c = addLine(c, { productId: 'm', meat: 'beef', qty: 2, extraIds: ['bp', 'cs'] });
    expect(c).toHaveLength(1);
    expect(c[0].qty).toBe(3);
    expect(c[0].key).toBe(lineKey('m', 'beef', ['bp', 'cs']));
  });
  it('qty to zero removes line; switching meat merges', () => {
    let c = addLine([], { productId: 'm', meat: 'beef', qty: 1, extraIds: [] });
    c = addLine(c, { productId: 'm', meat: 'chicken', qty: 1, extraIds: [] });
    c = switchMeat(c, c[0].key, 'chicken');
    expect(c).toHaveLength(1);
    expect(c[0].qty).toBe(2);
    expect(changeQty(c, c[0].key, -2)).toHaveLength(0);
  });
  it('extra patty follows the meat, other extras stay', () => {
    expect(swapPattyExtra(['bp', 'cs'], 'chicken', extras).sort()).toEqual(['cp', 'cs']);
    expect(swapPattyExtra(['cp'], 'beef', extras)).toEqual(['bp']);
    expect(swapPattyExtra(['cs'], 'chicken', extras)).toEqual(['cs']);
    expect(swapPattyExtra([], 'beef', extras)).toEqual([]);
    expect(swapPattyExtra(['bp'], 'beef', extras)).toEqual(['bp']);
  });
  it('patty swap keeps the selection when the catalog has no patty of the new meat', () => {
    const onlyBeef = extras.filter((e) => e.id !== 'cp');
    expect(swapPattyExtra(['bp'], 'chicken', onlyBeef)).toEqual(['bp']);
    expect(pattyExtraFor('chicken', onlyBeef)).toBeUndefined();
    expect(pattyExtraFor('one', extras)).toBeUndefined();
    expect(pattyExtraFor('chicken', extras, 'other')).toBeUndefined();
    expect(pattyExtraFor('chicken', extras, 'g')?.id).toBe('cp');
  });
  it('switching meat swaps the patty extra and reprices the line', () => {
    const c = addLine([], { productId: 'm', meat: 'beef', qty: 2, extraIds: ['bp', 'cs'] });
    const sw = switchMeat(c, c[0].key, 'chicken', extras);
    expect(sw).toHaveLength(1);
    expect(sw[0].meat).toBe('chicken');
    expect([...sw[0].extraIds].sort()).toEqual(['cp', 'cs']);
    expect(sw[0].key).toBe(lineKey('m', 'chicken', ['cp', 'cs']));
    expect(unitPrice(mustard, 'chicken', sw[0].extraIds, extras)).toBe(1900 + 690 + 200);
    // without the catalog the extras are untouched (legacy call)
    expect(switchMeat(c, c[0].key, 'chicken')[0].extraIds).toEqual(['bp', 'cs']);
  });
  it('switching meat merges into an existing line of the other meat', () => {
    let c = addLine([], { productId: 'm', meat: 'beef', qty: 1, extraIds: ['bp'] });
    c = addLine(c, { productId: 'm', meat: 'chicken', qty: 2, extraIds: ['cp'] });
    const sw = switchMeat(c, c[0].key, 'chicken', extras);
    expect(sw).toHaveLength(1);
    expect(sw[0].qty).toBe(3);
  });
  it('replaceLine swaps the old configuration for the new one and merges equal lines', () => {
    let c = addLine([], { productId: 'm', meat: 'beef', qty: 1, extraIds: [] });
    c = addLine(c, { productId: 'm', meat: 'chicken', qty: 2, extraIds: [] });
    const [beef, chicken] = c;
    const edited = replaceLine(c, beef.key, { productId: 'm', meat: 'beef', qty: 3, extraIds: ['cs'] });
    expect(edited).toHaveLength(2);
    expect(edited.find((l) => l.key === beef.key)).toBeUndefined();
    expect(edited.find((l) => l.key === lineKey('m', 'beef', ['cs']))?.qty).toBe(3);
    const merged = replaceLine(c, beef.key, { productId: 'm', meat: 'chicken', qty: 1, extraIds: [] });
    expect(merged).toHaveLength(1);
    expect(merged[0].key).toBe(chicken.key);
    expect(merged[0].qty).toBe(3);
    expect(replaceLine(c, 'unknown', { productId: 'm', meat: 'beef', qty: 1, extraIds: [] })).toHaveLength(2);
  });
  it('upsell offers only sides and drinks, never sauces', () => {
    const list = [prod('b', 'burgers'), prod('fr', 'sides'), prod('ng', 'sides'), prod('cs1', 'sauces', 'cheese-sauce'), prod('co', 'drinks'), prod('cb', 'combo')];
    const u = upsellProducts(list);
    expect(u.sides.map((p) => p.id)).toEqual(['fr', 'ng']);
    expect(u.drinks.map((p) => p.id)).toEqual(['co']);
    expect(upsellProducts(list, 'fr').sides.map((p) => p.id)).toEqual(['ng']);
  });
  it('totals with delivery fee and unavailable lines', () => {
    const c = addLine(addLine([], { productId: 'm', meat: 'chicken', qty: 2, extraIds: ['cs'] }), { productId: 'f', meat: 'one', qty: 1, extraIds: [] });
    const t = cartTotals(c, [mustard, fanta], extras, 500);
    expect(t.subtotal).toBe(2 * 2100);
    expect(t.total).toBe(4200 + 500);
    expect(t.unavailable).toBe(1);
  });
});

const br = (id: string, lat: number, lon: number, extra: Partial<Branch> = {}): Branch => ({
  id, slug: id, name: id, short_name: id, address: '', map_url: null, lat, lon, coords_verified: true,
  delivery_radius_km: 8, delivery_fee_kzt: 0, min_order_kzt: 0, is_active: true, accepts_orders: true, ...extra,
});
const allDay = (ids: string[]): Hours[] => ids.flatMap((id) => [0, 1, 2, 3, 4, 5, 6].flatMap((d) => [
  { branch_id: id, day_of_week: d, open_time: '00:00:00', close_time: '06:00:00' },
  { branch_id: id, day_of_week: d, open_time: '08:00:00', close_time: '00:00:00' },
]));

const AREA = almatyRings as Ring[];

describe('branch assignment', () => {
  const zhar = br('zhar', 43.211785, 76.902073), tole = br('tole', 43.250623, 76.879649);
  const hours = allDay(['zhar', 'tole']);
  const noonAlmaty = new Date('2026-11-03T07:00:00Z'); // 12:00 UTC+5
  const breakAlmaty = new Date('2026-11-03T01:30:00Z'); // 06:30

  it('haversine sane', () => {
    expect(haversineKm({ lat: 43.2118, lon: 76.9021 }, { lat: 43.2506, lon: 76.8796 })).toBeGreaterThan(4);
  });
  it('picks nearest open branch', () => {
    expect(pickDeliveryBranch({ lat: 43.25, lon: 76.88 }, [zhar, tole], hours, AREA, noonAlmaty).branch?.id).toBe('tole');
  });
  it('outside Almaty (Kaskelen, Talgar) is rejected; airport is inside', () => {
    expect(pickDeliveryBranch({ lat: 43.2, lon: 76.62 }, [zhar, tole], hours, AREA, noonAlmaty).reason).toBe('OUTSIDE_CITY');
    expect(inServiceArea({ lat: 43.30, lon: 77.24 }, AREA)).toBe(false);
    expect(pickDeliveryBranch({ lat: 43.3521, lon: 77.0405 }, [zhar, tole], hours, AREA, noonAlmaty).reason).toBe('OK');
  });
  it('break 06:00–08:00 closes branches', () => {
    expect(isBranchOpen('zhar', hours, breakAlmaty)).toBe(false);
    expect(pickDeliveryBranch({ lat: 43.25, lon: 76.88 }, [zhar, tole], hours, AREA, breakAlmaty).reason).toBe('CLOSED');
  });
  it('skips branch not accepting orders; coords verification does not matter', () => {
    const p = pickDeliveryBranch({ lat: 43.25, lon: 76.88 }, [zhar, { ...tole, accepts_orders: false }], hours, AREA, noonAlmaty);
    expect(p.branch?.id).toBe('zhar');
    expect(pickDeliveryBranch({ lat: 43.25, lon: 76.88 }, [{ ...zhar, coords_verified: false }], hours, AREA, noonAlmaty).branch?.id).toBe('zhar');
  });
});

describe('phone', () => {
  it('normalizes KZ formats', () => {
    for (const v of ['+7 747 400 53 47', '87474005347', '7474005347', '77474005347']) expect(normalizeKzPhone(v)).toBe('+77474005347');
    expect(normalizeKzPhone('12345')).toBeNull();
    expect(normalizeKzPhone('+7 147 400 53 47')).toBeNull();
  });
  it('deterministic internal email + mask', () => {
    expect(internalEmailFor('+77474005347')).toBe('87474005347@wa.tokburger.invalid');
    expect(maskPhone('+77474005347')).toBe('+7 747 *** ** 47');
  });
});

import { parseNutrition } from '@/features/catalog/nutrition';
describe('nutrition parsing', () => {
  it('parses Russian and Kazakh lines', () => {
    expect(parseNutrition('Б 33 · Ж 33 · У 46 · 619 ккал')).toEqual({ kcal: 619, protein: 33, fat: 33, carbs: 46 });
    expect(parseNutrition('А 41 · М 62 · Ұ 53 · 934 ккал')).toEqual({ kcal: 934, protein: 41, fat: 62, carbs: 53 });
  });
  it('returns null when nothing is recognisable', () => {
    expect(parseNutrition(null)).toBeNull();
    expect(parseNutrition('нет данных')).toBeNull();
  });
});
