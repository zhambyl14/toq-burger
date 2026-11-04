'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { ProductImg, Spinner, toast } from '@/components/ui';
import { defaultMeat, useMounted, variantImage } from '@/features/catalog/hooks';
import { cartTotals, unitPrice } from '@/features/cart/pricing';
import { useQuote } from '@/features/branches/useQuote';
import { useLang } from '@/i18n/LangProvider';
import { useApp } from '@/stores/app';
import { fmt } from '@/lib/money';
import { BoltMark } from '@/components/customer/BoltMark';
import { PricePill } from '@/components/customer/PricePill';
import { PriceTag } from '@/components/customer/PriceTag';
import { sb, supabaseConfigured } from '@/lib/supabase/client';
import type { Meat } from '@/types/catalog';
import '@/styles/flow.css';

export default function CartPage() {
  const router = useRouter();
  const { t, tx } = useLang();
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

  const meatL = (m: Meat) => (m === 'beef' ? t('Говядина', 'Сиыр еті') : m === 'chicken' ? t('Курица', 'Тауық еті') : '');

  if (!mounted) {
    return (
      <div className="fl-page" aria-busy="true" aria-label={t('Загрузка корзины', 'Себет жүктелуде')}>
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
    if (!supabaseConfigured()) return toast(t('База не подключена', 'Дерекқор қосылмаған'));
    setChecking(true);
    const { data, error } = await sb().rpc('quote_promo', { p_code: code, p_subtotal: tot.subtotal });
    setChecking(false);
    if (error || data == null) { s.set({ promo: '' }); setDiscount(null); toast(t('Промокод не найден', 'Промокод табылмады')); return; }
    s.set({ promo: code });
    setDiscount({ code, amount: data as number });
    toast(t('Промокод применён', 'Промокод қолданылды'));
  };

  if (!s.cart.length) {
    const picks = products.filter((p) => p.category === 'burgers' && p.variants.some((v) => v.price != null)).slice(0, 3);
    return (
      <div className="scr-in fl-page">
        <h1 className="disp fl-title">{t('Корзина', 'Себет')}</h1>
        <div className="fl-empty">
          <div className="fl-empty__bolt"><BoltMark size={72} /></div>
          <div className="disp" style={{ fontSize: 21, fontWeight: 800, marginTop: 24 }}>{t('Здесь пока пусто', 'Мұнда әзірге бос')}</div>
          <div style={{ fontSize: 14, color: '#6B6258', marginTop: 8, fontWeight: 600 }}>{t('Голод сам себя не накормит. Выберите бургер, а мы всё приготовим.', 'Аштық өзін-өзі тойдырмайды. Бургерді таңдаңыз, қалғанын өзіміз дайындаймыз.')}</div>
          <Link href="/menu" className="btn primary" style={{ display: 'inline-flex', alignItems: 'center', marginTop: 20, height: 56, padding: '0 32px', borderRadius: 28, fontSize: 16, textDecoration: 'none' }}>{t('Выбрать в меню', 'Мәзірден таңдау')}</Link>
        </div>
        {picks.length > 0 && (
          <>
            <h2 className="disp fl-h" style={{ margin: '8px 0 10px' }}>{t('Начните с этого', 'Осыдан бастаңыз')}</h2>
            <div className="fl-picks">
              {picks.map((p) => (
                <Link key={p.id} href={`/product/${p.slug}`} className="btn fl-pick">
                  <div style={{ flex: 'none', width: 64, height: 56, background: '#FFF1E0', borderRadius: 14, overflow: 'hidden' }}><ProductImg path={p.image} fit="contain" /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{tx(p.name, p.nameKk)}</div>
                    <div style={{ marginTop: 4 }}>
                      <PriceTag amount={Math.min(...p.variants.map((v) => v.price).filter((x): x is number => x != null))} prefix={p.variants.filter((v) => v.price != null).length > 1 ? t('от ', 'бастап ') : ''} size={13} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  const payable = tot.total - disc;
  const cta = (
    <button className="btn primary" disabled={tot.unavailable > 0} onClick={() => router.push('/checkout')}
      style={{ height: 56, borderRadius: 28, fontSize: 16, opacity: tot.unavailable ? 0.45 : 1, boxShadow: '0 12px 28px rgba(255,106,10,.4)' }}>
      {t('Оформить заказ', 'Тапсырыс беру')} · {fmt(payable)}
    </button>
  );

  return (
    <div className="scr-in fl-page">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h1 className="disp fl-title">{t('Корзина', 'Себет')}</h1>
        <span className="fl-count">{tot.count} {t('шт.', 'дана')}</span>
      </div>

      <div className="dsplit">
        <div style={{ minWidth: 0 }}>
          <div className="fl-lines">
            {s.cart.map((l) => {
              const p = products.find((x) => x.id === l.productId);
              const u = unitPrice(p, l.meat, l.extraIds, extras);
              if (!p) {
                return (
                  <div key={l.key} className="fl-line fl-line--gone">
                    <div className="fl-line__info" style={{ fontWeight: 800, fontSize: 15, color: '#B3261E' }}>{t('Позиция больше недоступна', 'Бұл позиция енді қолжетімсіз')}</div>
                    <button className="btn fl-line__rm" onClick={() => s.remove(l.key)} aria-label={t('Удалить', 'Жою')}>✕</button>
                  </div>
                );
              }
              const isB = p.category === 'burgers';
              const other = l.meat === 'beef' ? 'chicken' : 'beef';
              const canSwitch = isB && p.variants.some((v) => v.meat === other && v.price != null);
              const exNames = l.extraIds.map((id) => extras.find((e) => e.id === id)).filter((e): e is NonNullable<typeof e> => !!e).map((e) => tx(e.name, e.nameKk));
              const sub = [isB ? meatL(l.meat) : tx(p.tagline, p.taglineKk)].concat(exNames.length ? ['+ ' + exNames.join(', ')] : []).filter(Boolean).join(' · ');
              return (
                <div key={l.key} className="fl-line">
                  <div className="fl-line__img" style={{ background: p.slug === 'classic' ? '#FF6A0A' : '#FFF1E0' }}>
                    <ProductImg path={variantImage(p, l.meat)} fit={p.slug === 'classic' ? 'cover' : 'contain'} />
                  </div>
                  <div className="fl-line__info">
                    <div className="fl-line__name">{tx(p.name, p.nameKk)}</div>
                    <div className="fl-line__sub">{sub}</div>
                    {u == null && <div style={{ fontSize: 12, color: '#B3261E', fontWeight: 800, marginTop: 4 }}>{t('Сейчас недоступно — удалите позицию', 'Қазір қолжетімсіз — позицияны жойыңыз')}</div>}
                    {canSwitch && (
                      <button className="btn" onClick={() => { s.switchMeat(l.key, other); toast(t('Мясо изменено: ', 'Ет өзгертілді: ') + meatL(other)); }}
                        style={{ marginTop: 6, minHeight: 32, padding: '0 12px', borderRadius: 16, background: '#FFF1E0', color: '#C24D00', fontWeight: 800, fontSize: 12 }}>{t('Сменить на: ', 'Ауыстыру: ')}{meatL(other)}</button>
                    )}
                  </div>
                  <button className="btn fl-line__rm" onClick={() => s.remove(l.key)} aria-label={t('Удалить', 'Жою')}>✕</button>
                  <div className="fl-line__qty">
                    <button className="btn" onClick={() => s.qty(l.key, -1)} aria-label={t('Меньше', 'Азайту')}>−</button>
                    <div style={{ minWidth: 18, textAlign: 'center', fontWeight: 800 }}>{l.qty}</div>
                    <button className="btn" onClick={() => s.qty(l.key, 1)} aria-label={t('Больше', 'Көбейту')}>+</button>
                  </div>
                  <div className="fl-line__price">{u != null ? <PriceTag amount={u * l.qty} tone="ink" size={17} /> : '—'}</div>
                </div>
              );
            })}
          </div>

          {upsell.length > 0 && (
            <section aria-label={t('Добавить к заказу', 'Тапсырысқа қосу')} style={{ marginTop: 22 }}>
              <h2 className="disp fl-h">{t('Добавить к заказу', 'Тапсырысқа қосу')}</h2>
              <div className="fl-up">
                {upsell.map((p) => {
                  const meat = defaultMeat(p);
                  const u = unitPrice(p, meat, [], extras);
                  const nm = tx(p.name, p.nameKk);
                  return (
                    <div key={p.id} className="fl-up__card">
                      <div className="fl-up__img"><ProductImg path={variantImage(p, meat)} fit="contain" /></div>
                      <div style={{ fontWeight: 800, fontSize: 13, marginTop: 8, lineHeight: 1.2, flex: 1 }}>{nm}</div>
                      <button className="btn" disabled={u == null} aria-label={`${t('Добавить', 'Қосу')}: ${nm}`}
                        onClick={() => { s.add({ productId: p.id, meat, qty: 1, extraIds: [] }); toast(t('Добавлено: ', 'Қосылды: ') + nm); }}
                        style={{ marginTop: 8, minHeight: 44, borderRadius: 14, background: '#FF6A0A', color: '#fff', fontWeight: 800, fontSize: 13 }}>
                        {u != null ? <PriceTag amount={u} prefix="+ " tone="ink" size={13} color="#fff" /> : '+ —'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <aside className="dsticky fl-aside" aria-label={t('Итог заказа', 'Тапсырыс қорытындысы')}>
          <div className="fl-card">
            <label htmlFor="promo" className="fl-cap">{t('ПРОМОКОД', 'ПРОМОКОД')}</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input id="promo" value={promoInput} onChange={(e) => setPromoInput(e.target.value)} placeholder={t('Есть промокод?', 'Промокод бар ма?')}
                style={{ flex: 1, minWidth: 0, height: 48, borderRadius: 14, border: '2px solid #F3EADF', padding: '0 12px', fontSize: 14, fontWeight: 700, outline: 'none', textTransform: 'uppercase' }} />
              <button className="btn dark" onClick={applyPromo} disabled={checking} aria-label={t('Применить промокод', 'Промокодты қолдану')} style={{ minWidth: 64, height: 48, padding: '0 16px', borderRadius: 14 }}>{checking ? <Spinner /> : 'OK'}</button>
            </div>
            {disc > 0 && <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: '#2E8B3F' }}>{t('Промокод', 'Промокод')} {s.promo} {t('применён', 'қолданылды')}: −{fmt(disc)}</div>}
          </div>
          <input value={s.note} onChange={(e) => s.set({ note: e.target.value.slice(0, 500) })} placeholder={t('Комментарий к заказу', 'Тапсырысқа түсініктеме')} aria-label={t('Комментарий к заказу', 'Тапсырысқа түсініктеме')}
            style={{ width: '100%', boxSizing: 'border-box', height: 52, borderRadius: 18, border: '2px solid #FFD9B8', background: '#fff', padding: '0 14px', fontSize: 14, fontWeight: 600, outline: 'none' }} />

          <div className="fl-sum">
            <BoltMark size={56} rotate={-6} style={{ position: 'absolute', left: -12, top: -26, filter: 'drop-shadow(0 4px 6px rgba(249,96,0,.25))' }} />
            <h2 className="disp fl-sum__title">{t('Ваш заказ', 'Сіздің тапсырысыңыз')}</h2>
            <div className="fl-sum__row"><span style={{ color: '#6B6258' }}>{t('Сумма', 'Сома')} ({tot.count} {t('шт.', 'дана')})</span><PriceTag amount={tot.subtotal} tone="ink" size={14} weight={700} /></div>
            {disc > 0 && <div className="fl-sum__row" style={{ color: '#2E8B3F' }}><span>{t('Скидка', 'Жеңілдік')} ({s.promo})</span><PriceTag amount={disc} prefix="−" tone="ink" size={14} weight={700} /></div>}
            <div className="fl-sum__row">
              <span style={{ color: '#6B6258' }}>{t('Доставка', 'Жеткізу')} {quote.mode === 'DELIVERY' && !quote.branch && <span style={{ fontSize: 11 }}>({t('после выбора адреса', 'мекенжай таңдалғаннан кейін')})</span>}</span>
              {quote.mode === 'PICKUP' ? <span>{t('самовывоз', 'өзі алып кету')}</span> : <PriceTag amount={quote.fee} tone="ink" size={14} weight={700} />}
            </div>
            <div className="fl-div" aria-hidden="true"><i /></div>
            <div className="fl-sum__total">
              <PricePill kk="барлығы" ru="итого" price={payable} size="lg" />
            </div>
            {tot.unavailable > 0 && <div role="alert" style={{ fontSize: 13, fontWeight: 800, color: '#B3261E' }}>{t('Удалите недоступные позиции, чтобы оформить заказ.', 'Тапсырыс беру үшін қолжетімсіз позицияларды жойыңыз.')}</div>}
            <div className="only-desktop fl-cta">{cta}</div>
          </div>
        </aside>
      </div>

      <div className="only-mobile fl-cta">{cta}</div>
    </div>
  );
}
