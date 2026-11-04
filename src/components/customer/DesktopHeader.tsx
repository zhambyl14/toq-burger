'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCatalog } from '@/components/CatalogProvider';
import { Logo } from '@/components/ui';
import { cartTotals } from '@/features/cart/pricing';
import { useMounted } from '@/features/catalog/hooks';
import { useSession } from '@/hooks/useSession';
import { useLang } from '@/i18n/LangProvider';
import { LangSwitch } from '@/i18n/LangSwitch';
import { fmt } from '@/lib/money';
import { BoltMark } from './BoltMark';
import { useApp } from '@/stores/app';
import '@/styles/home.css';

/** Top navigation for desktop (>= 900px). Hidden on mobile via CSS (.dhead). */
export function DesktopHeader() {
  const path = usePathname();
  const { t } = useLang();
  const { products, extras } = useCatalog();
  const cart = useApp((s) => s.cart);
  const address = useApp((s) => s.address);
  const mounted = useMounted();
  const session = useSession();

  const totals = mounted ? cartTotals(cart, products, extras, 0) : { count: 0, subtotal: 0 };
  const links = [
    { href: '/', label: t('Главная', 'Басты бет') },
    { href: '/menu', label: t('Меню', 'Мәзір') },
    { href: '/branches', label: t('Филиалы', 'Филиалдар') },
  ];
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  return (
    <header className="dhead">
      <div className="dhead-inner">
        <Link href="/" aria-label="TOK BURGER" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flex: 'none' }}>
          <Logo size={44} radius={14} />
          <span className="disp dh-name" style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>TOK BURGER</span>
          <BoltMark size={22} rotate={-8} style={{ marginLeft: -4 }} />
        </Link>

        <nav aria-label={t('Основная навигация', 'Негізгі навигация')} style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="dnav-link" aria-current={active(l.href) ? 'page' : undefined}>{l.label}</Link>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        <Link href="/map" className="btn" aria-label={`${t('Адрес доставки', 'Жеткізу мекенжайы')}: ${mounted && address ? address.label : t('Выберите адрес', 'Мекенжайды таңдаңыз')}`} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 16px', borderRadius: 22, background: '#fff', textDecoration: 'none', maxWidth: 280, boxShadow: '0 4px 14px rgba(120,60,0,.08)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C24D00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></svg>
          <span className="dh-addr-t" style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {mounted && address ? address.label : t('Выберите адрес', 'Мекенжайды таңдаңыз')}
          </span>
        </Link>

        <LangSwitch />

        <Link href={session.user ? '/profile' : '/auth'} className="btn" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 18px', borderRadius: 22, background: 'var(--sand)', fontWeight: 800, fontSize: 14, color: 'var(--ink)', textDecoration: 'none' }}>
          {session.user ? t('Профиль', 'Профиль') : t('Войти', 'Кіру')}
        </Link>

        <Link href="/cart" className="btn" aria-label={totals.count > 0 ? t(`Корзина, ${totals.count} шт., ${fmt(totals.subtotal)}`, `Себет, ${totals.count} дана, ${fmt(totals.subtotal)}`) : t('Корзина', 'Себет')} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '0 20px', borderRadius: 24, background: 'var(--orange)', color: '#fff', fontWeight: 800, fontSize: 14, textDecoration: 'none', boxShadow: '0 10px 22px rgba(255,106,10,.35)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h2.5l2 11h10l2-8H7" /><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /></svg>
          {totals.count > 0 ? (
            <span>{totals.count} · {fmt(totals.subtotal)}</span>
          ) : (
            <span>{t('Корзина', 'Себет')}</span>
          )}
        </Link>
      </div>
    </header>
  );
}
