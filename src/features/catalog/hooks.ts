'use client';
import { useMemo, useSyncExternalStore } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { isBranchOpen } from '@/features/branches/assign';
import type { Meat, Product } from '@/types/catalog';
import { fmt } from '@/lib/money';

export const meatName = (m: Meat) => (m === 'beef' ? 'Говядина' : m === 'chicken' ? 'Курица' : '');

export function defaultMeat(p: Product): Meat {
  return p.variants.find((v) => v.meat === 'beef' && v.price != null)?.meat
    ?? p.variants.find((v) => v.price != null)?.meat ?? p.variants[0]?.meat ?? 'one';
}

export function priceFrom(p: Product): string {
  const prices = p.variants.map((v) => v.price).filter((x): x is number => x != null);
  if (!prices.length) return 'Цена уточняется';
  return (prices.length > 1 ? 'от ' : '') + fmt(Math.min(...prices));
}

export function meatsLabel(p: Product): string {
  return p.variants.filter((v) => v.meat !== 'one').map((v) => meatName(v.meat)).join(' · ');
}

export function variantImage(p: Product, meat: Meat): string | null {
  return p.variants.find((v) => v.meat === meat)?.image ?? p.image;
}

// ---- minute clock as an external store (no setState-in-effect, hydration safe) ----
const minuteListeners = new Set<() => void>();
let minuteTimer: ReturnType<typeof setInterval> | null = null;
function subscribeMinute(cb: () => void) {
  minuteListeners.add(cb);
  if (!minuteTimer) minuteTimer = setInterval(() => minuteListeners.forEach((l) => l()), 30_000);
  return () => {
    minuteListeners.delete(cb);
    if (!minuteListeners.size && minuteTimer) { clearInterval(minuteTimer); minuteTimer = null; }
  };
}
const minuteNow = () => Math.floor(Date.now() / 60_000);
const minuteServer = () => 0;

/** Current minute as a Date on the client; null during SSR/hydration. */
export function useNowMinute(): Date | null {
  const m = useSyncExternalStore(subscribeMinute, minuteNow, minuteServer);
  return useMemo(() => (m ? new Date(m * 60_000) : null), [m]);
}

/** True while every branch is closed (the 06:00–08:00 break). Re-evaluated each minute. */
export function useBreak(): boolean {
  const { branches, hours } = useCatalog();
  const now = useNowMinute();
  return useMemo(() => {
    if (!now || !branches.length) return false;
    return !branches.some((b) => isBranchOpen(b.id, hours, now));
  }, [now, branches, hours]);
}

const noopSubscribe = () => () => {};
/** False during SSR/hydration, true on the client: avoids localStorage hydration mismatches. */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
