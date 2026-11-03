'use client';
import { useSyncExternalStore } from 'react';

export interface Snack { id: number; text: string; href: string; label: string }

let current: Snack | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }

/** Small bottom snackbar with an action link (toast() has no action). Auto-hides after 4 s. */
export function showSnack(text: string, href: string, label: string) {
  if (timer) clearTimeout(timer);
  seq += 1;
  current = { id: seq, text, href, label };
  emit();
  timer = setTimeout(() => { current = null; emit(); }, 4000);
}

export function hideSnack() {
  if (timer) clearTimeout(timer);
  current = null;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useSnack(): Snack | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
