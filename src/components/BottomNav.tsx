'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMounted } from '@/features/catalog/hooks';
import { useApp } from '@/stores/app';

const ICONS: Record<string, React.ReactNode> = {
  home: <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  menu: <><path d="M4 11a8 7 0 0 1 16 0z" /><path d="M3 15h18" /><path d="M5 18.5h14a3 3 0 0 1-3 2.5H8a3 3 0 0 1-3-2.5z" /></>,
  cart: <><path d="M3 4h2.5l2 11h10l2-8H7" /><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
};

const ITEMS = [
  { href: '/', label: 'Главная', icon: 'home' },
  { href: '/menu', label: 'Меню', icon: 'menu' },
  { href: '/cart', label: 'Корзина', icon: 'cart' },
  { href: '/profile', label: 'Профиль', icon: 'user' },
];

const HIDDEN = ['/product', '/checkout', '/auth', '/map'];

export function BottomNav() {
  const path = usePathname();
  const cart = useApp((s) => s.cart);
  const bump = useApp((s) => s.bump);
  const mounted = useMounted();
  if (HIDDEN.some((h) => path.startsWith(h))) return null;
  const count = mounted ? cart.reduce((a, c) => a + c.qty, 0) : 0;

  return (
    <nav className="bottom-nav" aria-label="Навигация">
      {ITEMS.map((n) => {
        const active = n.href === '/' ? path === '/' : path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} prefetch className="btn"
            style={{ flex: 1, minHeight: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: active ? '#FF6A0A' : '#6B6258', position: 'relative', textDecoration: 'none' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[n.icon]}</svg>
            <span style={{ fontSize: 11, fontWeight: 800 }}>{n.label}</span>
            {n.icon === 'cart' && count > 0 && (
              <span key={bump} aria-label={`${count} в корзине`} style={{ position: 'absolute', top: 2, right: 'calc(50% - 26px)', minWidth: 18, height: 18, borderRadius: 9, background: '#FF6A0A', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', animation: 'pop1 .45s ease' }}>{count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
