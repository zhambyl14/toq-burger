'use client';
import { useMemo, useSyncExternalStore } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { isBranchOpen } from '@/features/branches/assign';
import type { Lang } from '@/i18n/lang';
import type { Meat, Product, Variant } from '@/types/catalog';
import { fmt } from '@/lib/money';

export const meatName = (m: Meat) => (m === 'beef' ? 'Говядина' : m === 'chicken' ? 'Курица' : '');

/** Language-aware meat name (Сиыр еті / Тауық еті in Kazakh). */
export const meatNameL = (m: Meat, lang: Lang): string => {
  if (lang === 'kk') return m === 'beef' ? 'Сиыр еті' : m === 'chicken' ? 'Тауық еті' : '';
  return meatName(m);
};

export function defaultMeat(p: Product): Meat {
  return p.variants.find((v) => v.meat === 'beef' && v.price != null)?.meat
    ?? p.variants.find((v) => v.price != null)?.meat ?? p.variants[0]?.meat ?? 'one';
}

export function priceFrom(p: Product): string {
  const prices = p.variants.map((v) => v.price).filter((x): x is number => x != null);
  if (!prices.length) return 'Цена уточняется';
  return (prices.length > 1 ? 'от ' : '') + fmt(Math.min(...prices));
}

/** Language-aware priceFrom: «от 1 900 ₸» / «1 900 ₸-ден» / «Цена уточняется» / «Бағасы нақтылануда». */
export function priceFromL(p: Product, lang: Lang): string {
  const prices = p.variants.map((v) => v.price).filter((x): x is number => x != null);
  if (!prices.length) return lang === 'kk' ? 'Бағасы нақтылануда' : 'Цена уточняется';
  const min = fmt(Math.min(...prices));
  if (prices.length === 1) return min;
  return lang === 'kk' ? `${min}-ден` : `от ${min}`;
}

export function meatsLabel(p: Product): string {
  return p.variants.filter((v) => v.meat !== 'one').map((v) => meatName(v.meat)).join(' · ');
}

export function meatsLabelL(p: Product, lang: Lang): string {
  return p.variants.filter((v) => v.meat !== 'one').map((v) => meatNameL(v.meat, lang)).join(' · ');
}

/**
 * Brand-native bilingual pill label of a variant (always kk + ru, regardless of the UI language):
 * chicken «тауық еті / курица», beef «сиыр еті / говядина», single-variant items use their unit ("100 г").
 */
export function pillLabel(v: Variant): { kk: string; ru: string } {
  if (v.meat === 'chicken') return { kk: 'тауық еті', ru: 'курица' };
  if (v.meat === 'beef') return { kk: 'сиыр еті', ru: 'говядина' };
  return { kk: v.labelKk?.trim() || v.label, ru: v.label };
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
