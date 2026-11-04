'use client';
import { beep } from '@/features/kitchen/sound';

const KEY = 'tok-courier-muted';

export function loadCourierMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function saveCourierMuted(v: boolean) {
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

/** New order assigned: two-tone beep (unless muted) + vibration where supported. */
export function alertNewOrder(muted: boolean) {
  if (!muted) beep();
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate([300, 120, 300]);
  } catch {
    /* vibration unavailable */
  }
}
