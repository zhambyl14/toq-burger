import type { Branch, Hours } from '@/types/catalog';

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371, t = Math.PI / 180;
  const dl = (b.lat - a.lat) * t, dn = (b.lon - a.lon) * t;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
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
  reason: 'OK' | 'OUT_OF_ZONE' | 'CLOSED' | 'NO_VERIFIED_BRANCHES';
}

/** Client-side preview of public.find_delivery_branch. The DB decides at checkout. */
export function pickDeliveryBranch(point: { lat: number; lon: number }, branches: Branch[], hours: Hours[], at: Date = new Date()): BranchPick {
  const geo = branches
    .filter((b) => b.is_active && b.coords_verified && b.lat != null && b.lon != null)
    .map((b) => ({ branch: b, distanceKm: haversineKm(point, { lat: b.lat!, lon: b.lon! }) }))
    .sort((a, c) => a.distanceKm - c.distanceKm);
  if (!geo.length) return { branch: null, distanceKm: null, nearest: null, reason: 'NO_VERIFIED_BRANCHES' };
  const inZone = geo.filter((g) => g.distanceKm <= g.branch.delivery_radius_km && g.branch.accepts_orders);
  const ok = inZone.find((g) => isBranchOpen(g.branch.id, hours, at));
  if (ok) return { branch: ok.branch, distanceKm: ok.distanceKm, nearest: geo[0], reason: 'OK' };
  return { branch: null, distanceKm: null, nearest: geo[0], reason: inZone.length ? 'CLOSED' : 'OUT_OF_ZONE' };
}
