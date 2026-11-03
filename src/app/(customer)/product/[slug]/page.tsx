'use client';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { HalalBadge } from '@/components/customer/HalalBadge';
import { cleanList, cleanText } from '@/components/customer/halal';
import { Heart, ProductImg, toast } from '@/components/ui';
import { defaultMeat, meatName, useMounted, variantImage } from '@/features/catalog/hooks';
import { unitPrice } from '@/features/cart/pricing';
import { useApp } from '@/stores/app';
import { fmt } from '@/lib/money';
import type { Meat } from '@/types/catalog';

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { products, extras } = useCatalog();
  const p = products.find((x) => x.slug === slug);
  const add = useApp((s) => s.add);
  const favs = useApp((s) => s.favs);
  const toggleFav = useApp((s) => s.toggleFav);
  const mounted = useMounted();
  const [meat, setMeat] = useState<Meat | null>(null);
  const [ex, setEx] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState<{ n: number; name: string } | null>(null);
  const cart = useApp((s) => s.cart);

  const back = () => (window.history.length > 1 ? router.back() : router.push('/menu'));

  if (!p) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <div className="disp" style={{ fontSize: 20, fontWeight: 800, marginTop: 40 }}>Товар не найден</div>
        <button className="btn primary" onClick={() => router.push('/menu')} style={{ marginTop: 20, height: 52, padding: '0 28px', borderRadius: 26 }}>В меню</button>
      </div>
    );
  }

  const m = meat ?? defaultMeat(p);
  const variant = p.variants.find((v) => v.meat === m);
  const groupExtras = extras.filter((e) => e.groupId === p.extraGroupId);
  const unit = unitPrice(p, m, ex, extras);
  const fav = mounted && favs.includes(p.id);
  const recs = products.filter((x) => x.slug === 'fries' || x.slug === 'nuggets');

  const addToCart = () => {
    if (unit == null) return;
    add({ productId: p.id, meat: m, qty, extraIds: ex });
    setAdded({ n: qty, name: p.name });
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', animation: 'up .35s ease both', background: '#FFF6EC', paddingBottom: 90 }}>
      <div style={{ background: '#FF6A0A', height: 300, position: 'relative', borderRadius: '0 0 40px 40px', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <button className="btn" onClick={back} aria-label="Назад" style={{ position: 'absolute', left: 16, top: 16, width: 44, height: 44, borderRadius: '50%', background: '#fff', fontSize: 20, fontWeight: 800 }}>←</button>
        <button className="btn" aria-label="В избранное" aria-pressed={fav} onClick={() => toast(toggleFav(p.id) ? 'Добавлено в избранное' : 'Убрано из избранного')}
          style={{ position: 'absolute', right: 16, top: 16, width: 44, height: 44, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Heart on={fav} /></button>
        <div style={{ width: 300, maxWidth: '78%', height: 250, marginTop: 20, animation: 'float 5s ease-in-out infinite' }}>
          <ProductImg path={variantImage(p, m)} alt={p.name} priority />
        </div>
      </div>

      <div style={{ padding: '22px 20px 0' }}>
        <h1 className="disp" style={{ fontSize: 26, fontWeight: 800 }}>{p.name}</h1>
        {p.tagline && <div style={{ fontSize: 13, fontWeight: 700, color: '#C24D00', marginTop: 4 }}>{p.tagline}</div>}
        <div style={{ marginTop: 10 }}><HalalBadge dark /></div>
        {cleanText(p.description) && <div style={{ fontSize: 14, lineHeight: 1.5, color: '#4A423A', marginTop: 10, fontWeight: 600 }}>{cleanText(p.description)}</div>}
        {cleanList(p.ingredients).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {cleanList(p.ingredients).map((i) => <span key={i} style={{ padding: '6px 10px', borderRadius: 12, background: '#fff', fontSize: 12, fontWeight: 700 }}>{i}</span>)}
          </div>
        )}
        {variant?.nutrition && <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: '#6B6258' }}>{variant.nutrition}</div>}

        {p.category === 'burgers' && (
          <>
            <div style={{ fontWeight: 800, fontSize: 15, marginTop: 22 }}>Мясо</div>
            <div role="radiogroup" aria-label="Мясо" style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              {(['chicken', 'beef'] as Meat[]).map((mm) => {
                const v = p.variants.find((x) => x.meat === mm);
                const has = v?.price != null;
                const act = m === mm && has;
                return (
                  <button key={mm} role="radio" aria-checked={act} disabled={!has} className="btn" onClick={() => has && setMeat(mm)}
                    style={{ flex: 1, minHeight: 56, borderRadius: 18, fontWeight: 800, fontSize: 15, background: act ? '#FF6A0A' : '#fff', color: act ? '#fff' : '#141210', opacity: has ? 1 : 0.4, boxShadow: '0 4px 14px rgba(120,60,0,.08)' }}>
                    {meatName(mm)}<br /><span style={{ fontSize: 12, opacity: 0.85 }}>{has ? fmt(v!.price!) : 'нет в меню'}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {groupExtras.length > 0 && (
          <>
            <div style={{ fontWeight: 800, fontSize: 15, marginTop: 22 }}>Дополнительно</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {groupExtras.map((e) => {
                const on = ex.includes(e.id);
                return (
                  <button key={e.id} role="checkbox" aria-checked={on} className="btn" onClick={() => setEx(on ? ex.filter((x) => x !== e.id) : [...ex, e.id])}
                    style={{ minHeight: 52, display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 16, padding: '0 14px', textAlign: 'left', border: `2px solid ${on ? '#FF6A0A' : '#fff'}` }}>
                    <span style={{ width: 22, height: 22, borderRadius: 7, background: on ? '#FF6A0A' : '#E5DACB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>{on ? '✓' : ''}</span>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{e.name}</span>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>+{fmt(e.price)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {p.category === 'burgers' && recs.length > 0 && (
          <>
            <div style={{ fontWeight: 800, fontSize: 15, marginTop: 22 }}>С этим берут</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              {recs.map((r) => {
                const v = r.variants[0];
                if (v?.price == null) return null;
                return (
                  <button key={r.id} className="btn" onClick={() => { add({ productId: r.id, meat: v.meat, qty: 1, extraIds: [] }); toast(`${r.name} в корзине`); }}
                    style={{ flex: 1, background: '#fff', borderRadius: 18, padding: 14, textAlign: 'left', minHeight: 64 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{r.name}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#C24D00', marginTop: 4 }}>{fmt(v.price)} · + в корзину</div>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <div style={{ height: 24 }} />
      </div>

      <div className="sticky-bar" style={{ background: '#fff', borderRadius: '28px 28px 0 0', padding: '14px 16px calc(18px + env(safe-area-inset-bottom))', display: 'flex', gap: 12, alignItems: 'center', boxShadow: '0 -10px 30px rgba(120,60,0,.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', background: '#F3EADF', borderRadius: 26, height: 52 }}>
          <button className="btn" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Меньше" style={{ width: 44, height: 52, fontSize: 22, fontWeight: 800 }}>−</button>
          <div aria-live="polite" style={{ minWidth: 20, textAlign: 'center', fontWeight: 800, fontSize: 16 }}>{qty}</div>
          <button className="btn" onClick={() => setQty(Math.min(50, qty + 1))} aria-label="Больше" style={{ width: 44, height: 52, fontSize: 22, fontWeight: 800 }}>+</button>
        </div>
        <button className="btn primary" disabled={unit == null} onClick={addToCart} style={{ flex: 1, height: 52, borderRadius: 26, fontSize: 16, opacity: unit == null ? 0.45 : 1 }}>
          {unit == null ? 'Нет в наличии' : `В корзину · ${fmt(unit * qty)}`}
        </button>
      </div>
    </div>
  );
}
