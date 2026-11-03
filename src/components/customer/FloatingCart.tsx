'use client';
import Link from 'next/link';
import { useCatalog } from '@/components/CatalogProvider';
import { cartTotals } from '@/features/cart/pricing';
import { useMounted } from '@/features/catalog/hooks';
import { fmt } from '@/lib/money';
import { useApp } from '@/stores/app';
import { hideSnack, useSnack } from './snack';

/** Cart bar above the bottom nav (+ the add-to-cart snackbar). Renders nothing when there is nothing to show. */
export function FloatingCart() {
  const { products, extras } = useCatalog();
  const cart = useApp((s) => s.cart);
  const bump = useApp((s) => s.bump);
  const mounted = useMounted();
  const snack = useSnack();
  const t = cartTotals(mounted ? cart : [], products, extras, 0);
  if (!t.count && !snack) return null;

  return (
    <div className="fcart-wrap">
      {snack && (
        <div key={snack.id} className="fcart-snack" role="status">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF6A0A', flex: 'none' }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{snack.text}</span>
          <Link href={snack.href} onClick={hideSnack} className="btn" style={{ minHeight: 44, display: 'flex', alignItems: 'center', padding: '0 6px', color: '#FF6A0A', fontWeight: 800, fontSize: 14, textDecoration: 'none', flex: 'none' }}>{snack.label}</Link>
        </div>
      )}
      {t.count > 0 && (
        <Link key={bump} href="/cart" className="btn fcart-bar" aria-label={`Корзина, ${t.count} шт., ${fmt(t.subtotal)}`}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h2.5l2 11h10l2-8H7" /><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /></svg>
            <span style={{ fontWeight: 800, fontSize: 15 }}>Корзина · {t.count}</span>
          </span>
          <span style={{ fontWeight: 800, fontSize: 15 }}>{fmt(t.subtotal)} →</span>
        </Link>
      )}
    </div>
  );
}
