import { describe, expect, it } from 'vitest';
import { addLine, cartTotals, changeQty, lineKey, switchMeat, unitPrice } from '@/features/cart/pricing';
import { haversineKm, isBranchOpen, pickDeliveryBranch } from '@/features/branches/assign';
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
const extras: Extra[] = [{ id: 'cs', slug: 'cheese-sauce', name: 'Сырный соус', price: 200, groupId: 'g' }, { id: 'bp', slug: 'beef-patty', name: 'Котлета', price: 790, groupId: 'g' }];

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

describe('branch assignment', () => {
  const zhar = br('zhar', 43.211785, 76.902073), tole = br('tole', 43.250623, 76.879649);
  const hours = allDay(['zhar', 'tole']);
  const noonAlmaty = new Date('2026-11-03T07:00:00Z'); // 12:00 UTC+5
  const breakAlmaty = new Date('2026-11-03T01:30:00Z'); // 06:30

  it('haversine sane', () => {
    expect(haversineKm({ lat: 43.2118, lon: 76.9021 }, { lat: 43.2506, lon: 76.8796 })).toBeGreaterThan(4);
  });
  it('picks nearest open branch', () => {
    expect(pickDeliveryBranch({ lat: 43.25, lon: 76.88 }, [zhar, tole], hours, noonAlmaty).branch?.id).toBe('tole');
  });
  it('out of zone', () => {
    expect(pickDeliveryBranch({ lat: 43.6, lon: 77.3 }, [zhar, tole], hours, noonAlmaty).reason).toBe('OUT_OF_ZONE');
  });
  it('break 06:00–08:00 closes branches', () => {
    expect(isBranchOpen('zhar', hours, breakAlmaty)).toBe(false);
    expect(pickDeliveryBranch({ lat: 43.25, lon: 76.88 }, [zhar, tole], hours, breakAlmaty).reason).toBe('CLOSED');
  });
  it('skips branch not accepting orders and unverified coords', () => {
    const p = pickDeliveryBranch({ lat: 43.25, lon: 76.88 }, [zhar, { ...tole, accepts_orders: false }], hours, noonAlmaty);
    expect(p.branch?.id).toBe('zhar');
    expect(pickDeliveryBranch({ lat: 43.25, lon: 76.88 }, [{ ...zhar, coords_verified: false }], hours, noonAlmaty).reason).toBe('NO_VERIFIED_BRANCHES');
  });
});

describe('phone', () => {
  it('normalizes KZ formats', () => {
    for (const v of ['+7 747 400 53 47', '87474005347', '7474005347', '77474005347']) expect(normalizeKzPhone(v)).toBe('+77474005347');
    expect(normalizeKzPhone('12345')).toBeNull();
    expect(normalizeKzPhone('+7 147 400 53 47')).toBeNull();
  });
  it('deterministic internal email + mask', () => {
    expect(internalEmailFor('+77474005347')).toBe('87474005347@mail.ru');
    expect(maskPhone('+77474005347')).toBe('+7 747 *** ** 47');
  });
});
