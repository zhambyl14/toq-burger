'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { ProductImg, Spinner, toast } from '@/components/ui';
import { meatName, useMounted, variantImage } from '@/features/catalog/hooks';
import { cartTotals, unitPrice } from '@/features/cart/pricing';
import { useQuote } from '@/features/branches/useQuote';
import { useApp } from '@/stores/app';
import { fmt } from '@/lib/money';
import { sb, supabaseConfigured } from '@/lib/supabase/client';

export default function CartPage() {
  const router = useRouter();
  const { products, extras } = useCatalog();
  const mounted = useMounted();
  const s = useApp();
  const quote = useQuote();
  const [promoInput, setPromoInput] = useState(s.promo);
  const [discount, setDiscount] = useState<{ code: string; amount: number } | null>(null);
  const [checking, setChecking] = useState(false);

  const tot = cartTotals(s.cart, products, extras, quote.fee);
  const promoCode = s.promo;
  const subtotal = tot.subtotal;
  const setApp = s.set;

  useEffect(() => {
    if (!promoCode || subtotal <= 0 || !supabaseConfigured()) return;
    let alive = true;
    sb().rpc('quote_promo', { p_code: promoCode, p_subtotal: subtotal }).then(({ data, error }) => {
      if (!alive) return;
      if (error) return;
      if (data == null) { setApp({ promo: '' }); setDiscount(null); return; }
      setDiscount({ code: promoCode, amount: data as number });
    });
    return () => { alive = false; };
  }, [promoCode, subtotal, setApp]);

  if (!mounted) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner dark /></div>;

  const disc = s.promo && discount && discount.code === s.promo ? Math.min(discount.amount, tot.subtotal) : 0;

  const applyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) { s.set({ promo: '' }); setDiscount(null); return; }
    if (!supabaseConfigured()) return toast('База не подключена');
    setChecking(true);
    const { data, error } = await sb().rpc('quote_promo', { p_code: code, p_subtotal: tot.subtotal });
    setChecking(false);
    if (error || data == null) { s.set({ promo: '' }); setDiscount(null); toast('Промокод не найден'); return; }
    s.set({ promo: code });
    setDiscount({ code, amount: data as number });
    toast('Промокод применён');
  };

  if (!s.cart.length) {
    return (
      <div className="scr-in" style={{ padding: 16 }}>
        <h1 className="disp" style={{ fontSize: 24, fontWeight: 800 }}>Корзина</h1>
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ width: 140, height: 116, margin: '0 auto', opacity: 0.5, filter: 'grayscale(.6)', borderRadius: 20, overflow: 'hidden' }}>
            <ProductImg path={products.find((p) => p.slug === 'classic')?.image} fit="cover" />
          </div>
          <div className="disp" style={{ fontSize: 20, fontWeight: 800, marginTop: 20 }}>Здесь пока пусто</div>
          <div style={{ fontSize: 14, color: '#6B6258', marginTop: 8, fontWeight: 600 }}>Голод сам себя не накормит. Выберите бургер.</div>
          <Link href="/menu" className="btn primary" style={{ display: 'inline-flex', alignItems: 'center', marginTop: 20, height: 52, padding: '0 28px', borderRadius: 26, fontSize: 16, textDecoration: 'none' }}>В меню</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="scr-in" style={{ padding: 16 }}>
      <h1 className="disp" style={{ fontSize: 24, fontWeight: 800 }}>Корзина</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
        {s.cart.map((l) => {
          const p = products.find((x) => x.id === l.productId);
          const u = unitPrice(p, l.meat, l.extraIds, extras);
          if (!p) {
            return (
              <div key={l.key} style={{ background: '#fff', borderRadius: 22, padding: 14, boxShadow: '0 8px 22px rgba(120,60,0,.07)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 15, color: '#B3261E' }}>Позиция больше недоступна</div>
                <button className="btn" onClick={() => s.remove(l.key)} aria-label="Удалить" style={{ flex: 'none', width: 44, height: 44, fontSize: 18, color: '#8A7F73' }}>✕</button>
              </div>
            );
          }
          const isB = p.category === 'burgers';
          const other = l.meat === 'beef' ? 'chicken' : 'beef';
          const canSwitch = isB && p.variants.some((v) => v.meat === other && v.price != null);
          const exNames = l.extraIds.map((id) => extras.find((e) => e.id === id)?.name).filter(Boolean);
          const sub = [isB ? meatName(l.meat) : p.tagline].concat(exNames.length ? ['+ ' + exNames.join(', ')] : []).filter(Boolean).join(' · ');
          return (
            <div key={l.key} style={{ background: '#fff', borderRadius: 22, padding: 14, boxShadow: '0 8px 22px rgba(120,60,0,.07)' }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 'none', width: 64, height: 60, background: p.slug === 'classic' ? '#FF6A0A' : '#FFF1E0', borderRadius: 14, padding: 2, boxSizing: 'border-box', overflow: 'hidden' }}>
                  <ProductImg path={variantImage(p, l.meat)} fit={p.slug === 'classic' ? 'cover' : 'contain'} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 700, marginTop: 2 }}>{sub}</div>
                  {u == null && <div style={{ fontSize: 12, color: '#B3261E', fontWeight: 800, marginTop: 4 }}>Сейчас недоступно — удалите позицию</div>}
                  {canSwitch && (
                    <button className="btn" onClick={() => { s.switchMeat(l.key, other); toast('Мясо изменено: ' + meatName(other)); }}
                      style={{ marginTop: 6, minHeight: 32, padding: '0 12px', borderRadius: 16, background: '#FFF1E0', color: '#C24D00', fontWeight: 800, fontSize: 12 }}>Сменить на: {meatName(other)}</button>
                  )}
                </div>
                <button className="btn" onClick={() => s.remove(l.key)} aria-label="Удалить" style={{ flex: 'none', width: 44, height: 44, fontSize: 18, color: '#8A7F73', alignSelf: 'flex-start' }}>✕</button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', background: '#F3EADF', borderRadius: 22, height: 44 }}>
                  <button className="btn" onClick={() => s.qty(l.key, -1)} aria-label="Меньше" style={{ width: 44, height: 44, fontSize: 20, fontWeight: 800 }}>−</button>
                  <div style={{ minWidth: 18, textAlign: 'center', fontWeight: 800 }}>{l.qty}</div>
                  <button className="btn" onClick={() => s.qty(l.key, 1)} aria-label="Больше" style={{ width: 44, height: 44, fontSize: 20, fontWeight: 800 }}>+</button>
                </div>
                <div style={{ fontWeight: 800, fontSize: 17 }}>{u != null ? fmt(u * l.qty) : '—'}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, background: '#fff', borderRadius: 22, padding: 14, display: 'flex', gap: 8 }}>
        <input value={promoInput} onChange={(e) => setPromoInput(e.target.value)} placeholder="Промокод" aria-label="Промокод"
          style={{ flex: 1, minWidth: 0, height: 44, borderRadius: 14, border: '2px solid #F3EADF', padding: '0 12px', fontSize: 14, fontWeight: 700, outline: 'none', textTransform: 'uppercase' }} />
        <button className="btn dark" onClick={applyPromo} disabled={checking} style={{ height: 44, padding: '0 16px', borderRadius: 14 }}>{checking ? <Spinner /> : 'OK'}</button>
      </div>
      <input value={s.note} onChange={(e) => s.set({ note: e.target.value.slice(0, 500) })} placeholder="Комментарий к заказу" aria-label="Комментарий к заказу"
        style={{ marginTop: 12, width: '100%', boxSizing: 'border-box', height: 52, borderRadius: 18, border: 0, background: '#fff', padding: '0 14px', fontSize: 14, fontWeight: 600, outline: 'none' }} />

      <div style={{ marginTop: 14, background: '#fff', borderRadius: 22, padding: 16, fontSize: 14, fontWeight: 700, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#6B6258' }}>Сумма</span><span>{fmt(tot.subtotal)}</span></div>
        {disc > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2E8B3F' }}><span>Скидка ({s.promo})</span><span>−{fmt(disc)}</span></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#6B6258' }}>Доставка {quote.mode === 'DELIVERY' && !quote.branch && <span style={{ fontSize: 11 }}>(после выбора адреса)</span>}</span>
          <span>{quote.mode === 'PICKUP' ? 'самовывоз' : fmt(quote.fee)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800, borderTop: '2px dashed #F3EADF', paddingTop: 10 }}><span>Итого</span><span>{fmt(tot.total - disc)}</span></div>
      </div>
      <button className="btn primary" disabled={tot.unavailable > 0} onClick={() => router.push('/checkout')}
        style={{ marginTop: 14, width: '100%', height: 56, borderRadius: 28, fontSize: 16, opacity: tot.unavailable ? 0.45 : 1 }}>
        Оформить заказ · {fmt(tot.total - disc)}
      </button>
      <div style={{ height: 8 }} />
    </div>
  );
}
