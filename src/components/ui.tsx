'use client';
import Image from 'next/image';
import { useState } from 'react';
import { useToast } from '@/stores/app';

export function imageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('/')) return path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/product-images/${path}` : null;
}

/** Brand mark from the owner's logo file. */
export function Logo({ size = 44, radius = 14 }: { size?: number; radius?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', display: 'inline-block', flex: 'none', position: 'relative' }}>
      <Image src="/logo.jpg" alt="TOK BURGER" fill sizes={`${size}px`} style={{ objectFit: 'cover' }} priority />
    </span>
  );
}

/** Product photo from Supabase Storage; falls back to the brand mark if missing. */
export function ProductImg({ path, fit = 'contain', alt = '', priority }: { path: string | null | undefined; fit?: 'contain' | 'cover'; alt?: string; priority?: boolean }) {
  const src = imageUrl(path);
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span style={{ position: 'relative', display: 'block', width: '100%', height: '100%', borderRadius: 'inherit', overflow: 'hidden', opacity: 0.9 }}>
        <Image src="/logo.jpg" alt={alt} fill sizes="200px" style={{ objectFit: 'cover' }} />
      </span>
    );
  }
  return (
    <span style={{ position: 'relative', display: 'block', width: '100%', height: '100%', borderRadius: 'inherit', overflow: 'hidden' }}>
      <Image src={src} alt={alt} fill sizes="(max-width: 480px) 60vw, 300px" style={{ objectFit: fit }} unoptimized
        priority={priority} onError={() => setFailed(true)} />
    </span>
  );
}

export function Toast() {
  const { text, id } = useToast();
  if (!text) return null;
  return (
    <div key={id} role="status" aria-live="polite" style={{ position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 32px)', maxWidth: 448, zIndex: 100 }}>
      <div style={{ background: '#141210', color: '#fff', borderRadius: 16, padding: '12px 16px', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, animation: 'toast 2.3s ease both', boxShadow: '0 10px 30px rgba(0,0,0,.3)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF6A0A', flex: 'none' }} />
        {text}
      </div>
    </div>
  );
}

export const toast = (t: string) => useToast.getState().show(t);

export function BackBtn({ onClick, light }: { onClick: () => void; light?: boolean }) {
  return (
    <button className="btn" onClick={onClick} aria-label="Назад"
      style={{ width: 44, height: 44, borderRadius: '50%', background: light ? 'rgba(255,255,255,.25)' : '#fff', color: light ? '#fff' : undefined, fontSize: 20, fontWeight: 800, flex: 'none' }}>←</button>
  );
}

export function Heart({ on }: { on: boolean }) {
  const c = on ? '#E5360B' : '#8A7F73';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={on ? '#E5360B' : 'none'} stroke={c} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20.5s-7.5-4.6-9.3-9.3C1.4 7.6 3.7 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.3 0 5.6 3.1 4.3 6.7-1.8 4.7-9.3 9.3-9.3 9.3z" />
    </svg>
  );
}

export function PinIcon({ size = 22, color = '#C24D00' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function Spinner({ dark }: { dark?: boolean }) {
  return <span className={'spinner' + (dark ? ' dark-s' : '')} aria-label="Загрузка" />;
}

export function NotConfigured() {
  return (
    <div style={{ margin: 16, background: '#141210', color: '#fff', borderRadius: 18, padding: '14px 16px', fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
      <b style={{ color: '#FF6A0A' }}>База данных не подключена.</b> Укажите NEXT_PUBLIC_SUPABASE_URL и ключи в окружении — меню и заказы загружаются из Supabase.
    </div>
  );
}
