'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { ProductImg, Spinner, toast } from '@/components/ui';
import { defaultMeat, meatName, priceFrom, useMounted, variantImage } from '@/features/catalog/hooks';
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

  const upsell = useMemo(() => {
    const inCart = new Set(s.cart.map((l) => l.productId));
    return products
      .filter((p) => (p.category === 'sides' || p.category === 'sauces') && !inCart.has(p.id) && p.variants.some((v) => v.price != null))
      .slice(0, 6);
  }, [products, s.cart]);

  if (!mounted) {
    return (
      <div style={{ padding: 16 }} aria-busy="true" aria-label="Загрузка корзины">
        <div style={{ width: 150, height: 30, borderRadius: 10, background: '#F3EADF', animation: 'fade .9s ease-in-out infinite alternate' }} />
        {[0, 1].map((i) => <div key={i} style={{ height: 124, borderRadius: 22, background: '#fff', marginTop: 14, animation: 'fade .9s ease-in-out infinite alternate' }} />)}
        <div style={{ height: 150, borderRadius: 22, background: '#fff', marginTop: 14, animation: 'fade .9s ease-in-out infinite alternate' }} />
      </div>
    );
  }

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
    const picks = products.filter((p) => p.category === 'burgers' && p.variants.some((v) => v.price != null)).slice(0, 3);
    return (
      <div className="scr-in" style={{ padding: 16 }}>
        <h1 className="disp" style={{ fontSize: 24, fontWeight: 800 }}>Корзина</h1>
        <div style={{ textAlign: 'center', padding: '40px 20px 24px' }}>
          <div style={{ width: 150, height: 124, margin: '0 auto', borderRadius: 30, overflow: 'hidden', background: '#FF6A0A', boxShadow: '0 14px 30px rgba(255,106,10,.28)', animation: 'float 3.2s ease-in-out infinite' }}>
            <ProductImg path={products.find((p) => p.slug === 'classic')?.image} fit="cover" />
          </div>
          <div className="disp" style={{ fontSize: 21, fontWeight: 800, marginTop: 24 }}>Здесь пока пусто</div>
          <div style={{ fontSize: 14, color: '#6B6258', marginTop: 8, fontWeight: 600 }}>Голод сам себя не накормит. Выберите бургер, а мы всё приготовим.</div>
          <Link href="/menu" className="btn primary" style={{ display: 'inline-flex', alignItems: 'center', marginTop: 20, height: 56, padding: '0 32px', borderRadius: 28, fontSize: 16, textDecoration: 'none' }}>Выбрать в меню</Link>
        </div>
        {picks.length > 0 && (
          <>
            <div className="disp" style={{ fontSize: 16, fontWeight: 800, margin: '8px 0 10px' }}>Начните с этого</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {picks.map((p) => (
                <Link key={p.id} href={`/product/${p.slug}`} className="btn" style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 22, padding: 10, textDecoration: 'none', color: '#141210', minHeight: 64, boxShadow: '0 8px 22px rgba(120,60,0,.07)' }}>
                  <div style={{ flex: 'none', width: 64, height: 56, background: '#FFF1E0', borderRadius: 14, overflow: 'hidden' }}><ProductImg path={p.image} fit="contain" /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 700 }}>{priceFrom(p)}</div>
                  </div>
                  <span aria-hidden="true" style={{ color: '#C24D00', fontWeight: 800, fontSize: 18 }}>›</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="scr-in" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h1 className="disp" style={{ fontSize: 24, fontWeight: 800 }}>Корзина</h1>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#6B6258' }}>{tot.count} шт.</span>
      </div>
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

      {upsell.length > 0 && (
        <section aria-label="Добавить к заказу" style={{ marginTop: 20 }}>
          <div className="disp" style={{ fontSize: 16, fontWeight: 800 }}>Добавить к заказу</div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '10px -16px 0', padding: '4px 16px 10px', scrollSnapType: 'x proximity' }}>
            {upsell.map((p) => {
              const meat = defaultMeat(p);
              const u = unitPrice(p, meat, [], extras);
              return (
                <div key={p.id} style={{ flex: 'none', width: 132, scrollSnapAlign: 'start', background: '#fff', borderRadius: 22, padding: 10, boxShadow: '0 8px 22px rgba(120,60,0,.07)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ height: 70, background: '#FFF1E0', borderRadius: 16, overflow: 'hidden' }}><ProductImg path={variantImage(p, meat)} fit="contain" /></div>
                  <div style={{ fontWeight: 800, fontSize: 13, marginTop: 8, lineHeight: 1.2, flex: 1 }}>{p.name}</div>
                  <button className="btn" disabled={u == null} aria-label={`Добавить: ${p.name}`}
                    onClick={() => { s.add({ productId: p.id, meat, qty: 1, extraIds: [] }); toast('Добавлено: ' + p.name); }}
                    style={{ marginTop: 8, minHeight: 44, borderRadius: 14, background: '#FF6A0A', color: '#fff', fontWeight: 800, fontSize: 13 }}>
                    + {u != null ? fmt(u) : '—'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div style={{ marginTop: 14, background: '#fff', borderRadius: 22, padding: 14 }}>
        <label htmlFor="promo" style={{ fontSize: 12, fontWeight: 800, color: '#6B6258' }}>ПРОМОКОД</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input id="promo" value={promoInput} onChange={(e) => setPromoInput(e.target.value)} placeholder="Есть промокод?"
            style={{ flex: 1, minWidth: 0, height: 48, borderRadius: 14, border: '2px solid #F3EADF', padding: '0 12px', fontSize: 14, fontWeight: 700, outline: 'none', textTransform: 'uppercase' }} />
          <button className="btn dark" onClick={applyPromo} disabled={checking} aria-label="Применить промокод" style={{ minWidth: 64, height: 48, padding: '0 16px', borderRadius: 14 }}>{checking ? <Spinner /> : 'OK'}</button>
        </div>
        {disc > 0 && <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: '#2E8B3F' }}>Промокод {s.promo} применён: −{fmt(disc)}</div>}
      </div>
      <input value={s.note} onChange={(e) => s.set({ note: e.target.value.slice(0, 500) })} placeholder="Комментарий к заказу" aria-label="Комментарий к заказу"
        style={{ marginTop: 12, width: '100%', boxSizing: 'border-box', height: 52, borderRadius: 18, border: 0, background: '#fff', padding: '0 14px', fontSize: 14, fontWeight: 600, outline: 'none' }} />

      <div style={{ marginTop: 14, background: '#fff', borderRadius: 26, padding: 18, fontSize: 14, fontWeight: 700, display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 10px 28px rgba(255,106,10,.12)' }}>
        <div className="disp" style={{ fontSize: 15, fontWeight: 800 }}>Ваш заказ</div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#6B6258' }}>Сумма ({tot.count} шт.)</span><span>{fmt(tot.subtotal)}</span></div>
        {disc > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2E8B3F' }}><span>Скидка ({s.promo})</span><span>−{fmt(disc)}</span></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#6B6258' }}>Доставка {quote.mode === 'DELIVERY' && !quote.branch && <span style={{ fontSize: 11 }}>(после выбора адреса)</span>}</span>
          <span>{quote.mode === 'PICKUP' ? 'самовывоз' : fmt(quote.fee)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '2px dashed #F3EADF', paddingTop: 12 }}>
          <span className="disp" style={{ fontSize: 16, fontWeight: 800 }}>Итого</span>
          <span className="disp" style={{ fontSize: 22, fontWeight: 800, color: '#C24D00' }}>{fmt(tot.total - disc)}</span>
        </div>
      </div>
      {tot.unavailable > 0 && <div role="alert" style={{ marginTop: 10, fontSize: 13, fontWeight: 800, color: '#B3261E' }}>Удалите недоступные позиции, чтобы оформить заказ.</div>}
      <div style={{ position: 'sticky', bottom: 84, zIndex: 30, marginTop: 14 }}>
        <button className="btn primary" disabled={tot.unavailable > 0} onClick={() => router.push('/checkout')}
          style={{ width: '100%', height: 56, borderRadius: 28, fontSize: 16, opacity: tot.unavailable ? 0.45 : 1, boxShadow: '0 12px 28px rgba(255,106,10,.4)' }}>
          Оформить заказ · {fmt(tot.total - disc)}
        </button>
      </div>
    </div>
  );
}
