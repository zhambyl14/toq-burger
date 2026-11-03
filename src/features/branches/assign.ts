import type { Branch, Hours } from '@/types/catalog';

export type Ring = [number, number][]; // [lon, lat]

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371, t = Math.PI / 180;
  const dl = (b.lat - a.lat) * t, dn = (b.lon - a.lon) * t;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Mirrors public.in_service_area (ray casting over outer rings). No rings => no restriction. */
export function inServiceArea(p: { lat: number; lon: number }, rings: Ring[]): boolean {
  if (!rings.length) return true;
  return rings.some((r) => {
    let inside = false;
    for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
      const [xi, yi] = r[i], [xk, yk] = r[k];
      if ((yi > p.lat) !== (yk > p.lat) && p.lon < ((xk - xi) * (p.lat - yi)) / (yk - yi) + xi) inside = !inside;
    }
    return inside;
  });
}

/** Almaty local day (0=Mon) and "HH:MM:SS" for a moment. */
export function almatyClock(at: Date): { day: number; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Almaty', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return { day: days.indexOf(get('weekday')), time: `${get('hour')}:${get('minute')}:${get('second')}` };
}

/** Mirrors public.branch_is_open (close 00:00 = midnight). */
export function isBranchOpen(branchId: string, hours: Hours[], at: Date = new Date()): boolean {
  const { day, time } = almatyClock(at);
  return hours.some((h) => h.branch_id === branchId && h.day_of_week === day && time >= h.open_time
    && (time < h.close_time || h.close_time.startsWith('00:00')));
}

export interface BranchPick {
  branch: Branch | null;
  distanceKm: number | null;
  nearest: { branch: Branch; distanceKm: number } | null;
  reason: 'OK' | 'OUTSIDE_CITY' | 'CLOSED' | 'NO_BRANCHES';
}

/**
 * Client-side preview of public.find_delivery_branch: the pin must be inside Almaty, then the
 * nearest active branch that accepts orders and is open at `at` is chosen. The DB decides at checkout.
 */
export function pickDeliveryBranch(point: { lat: number; lon: number }, branches: Branch[], hours: Hours[], area: Ring[], at: Date = new Date()): BranchPick {
  const geo = branches
    .filter((b) => b.is_active && b.lat != null && b.lon != null)
    .map((b) => ({ branch: b, distanceKm: haversineKm(point, { lat: b.lat!, lon: b.lon! }) }))
    .sort((a, c) => a.distanceKm - c.distanceKm);
  if (!geo.length) return { branch: null, distanceKm: null, nearest: null, reason: 'NO_BRANCHES' };
  if (!inServiceArea(point, area)) return { branch: null, distanceKm: null, nearest: geo[0], reason: 'OUTSIDE_CITY' };
  const ok = geo.find((g) => g.branch.accepts_orders && isBranchOpen(g.branch.id, hours, at));
  if (ok) return { branch: ok.branch, distanceKm: ok.distanceKm, nearest: geo[0], reason: 'OK' };
  return { branch: null, distanceKm: null, nearest: geo[0], reason: 'CLOSED' };
}
