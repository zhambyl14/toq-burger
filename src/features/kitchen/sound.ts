'use client';

const KEY = 'tok-kitchen-muted';

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(v: boolean) {
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

let ctx: AudioContext | null = null;

/** Short two-tone beep via WebAudio (no asset). Browsers require a prior user gesture. */
export function beep() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      const t = now + i * 0.22;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g).connect(ctx!.destination);
      o.start(t);
      o.stop(t + 0.21);
    });
  } catch {
    /* audio unavailable */
  }
}

/** Unlock audio on first interaction so realtime beeps can play later. */
export function unlockAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* ignore */
  }
}
