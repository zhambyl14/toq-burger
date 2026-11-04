import type { Lang } from '@/i18n/lang';
import type { Meat, OrderItemRow, OrderRow, OrderStatus } from '@/types/catalog';
import type { CBranch } from './useCourier';

export interface Point { lat: number; lon: number }

export const payLabel = (m: OrderRow['payment_method'], lang: Lang): string =>
  m === 'CASH' ? (lang === 'kk' ? 'Алғанда төлеу' : 'Оплата при получении')
    : m === 'KASPI_QR' ? 'Kaspi QR'
      : (lang === 'kk' ? 'Онлайн төленген' : 'Оплачено онлайн');

export const meatLabel = (m: Meat, lang: Lang): string =>
  m === 'beef' ? (lang === 'kk' ? 'Сиыр еті' : 'Говядина') : m === 'chicken' ? (lang === 'kk' ? 'Тауық еті' : 'Курица') : '';

/** Statuses at which the courier is still going to / waiting at the branch. */
export const PRE_PICKUP: OrderStatus[] = ['ACCEPTED', 'PREPARING', 'READY', 'COURIER_ASSIGNED'];
export const DELIVERING: OrderStatus[] = ['PICKED_UP', 'ON_THE_WAY'];

/** The kitchen has finished the order and the courier may take it. */
export const isReadyToPick = (s: OrderStatus) => s === 'READY' || s === 'COURIER_ASSIGNED';

export const itemsText = (o: OrderRow, nameOf: (i: OrderItemRow) => string, lang: Lang) =>
  (o.order_items ?? [])
    .map((i) => `${nameOf(i)}${i.meat !== 'one' ? ' (' + meatLabel(i.meat, lang).toLowerCase() + ')' : ''}${i.quantity > 1 ? ' ×' + i.quantity : ''}`)
    .join(' + ');

export const addrText = (o: OrderRow, lang: Lang) => {
  const kk = lang === 'kk';
  return [o.address_text, o.apartment && `${kk ? 'пәт.' : 'кв.'} ${o.apartment}`, o.entrance && `${kk ? 'кіреберіс' : 'подъезд'} ${o.entrance}`, o.floor && `${kk ? 'қабат' : 'этаж'} ${o.floor}`, o.intercom && `домофон ${o.intercom}`]
    .filter(Boolean)
    .join(', ');
};

export const gisUrl = (p: Point) => `https://2gis.kz/almaty/geo/${p.lon},${p.lat}`;
export const yandexUrl = (p: Point) => `https://yandex.kz/maps/?rtext=~${p.lat},${p.lon}&rtt=auto`;

export function haversineKm(a: Point, b: Point): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const dropPoint = (o: OrderRow): Point | null => (o.lat != null && o.lon != null ? { lat: o.lat, lon: o.lon } : null);

export const branchPoint = (b: CBranch | undefined): Point | null => (b && b.lat != null && b.lon != null ? { lat: b.lat, lon: b.lon } : null);

/** Nearest-neighbour ordering of drop points starting at `start`; orders without coordinates go last. */
export function orderStops(list: OrderRow[], start: Point | null): OrderRow[] {
  const left = list.filter((o) => dropPoint(o));
  const noGeo = list.filter((o) => !dropPoint(o));
  const out: OrderRow[] = [];
  let cur = start;
  while (left.length) {
    let best = 0;
    if (cur) {
      let bestD = Infinity;
      left.forEach((o, i) => {
        const p = dropPoint(o);
        const d = p ? haversineKm(cur as Point, p) : Infinity;
        if (d < bestD) { bestD = d; best = i; }
      });
    }
    const [next] = left.splice(best, 1);
    out.push(next);
    cur = dropPoint(next);
  }
  return [...out, ...noGeo];
}
