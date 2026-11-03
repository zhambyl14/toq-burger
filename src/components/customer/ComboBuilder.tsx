'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { ProductImg, toast } from '@/components/ui';
import { defaultMeat, variantImage } from '@/features/catalog/hooks';
import { fmt } from '@/lib/money';
import { useApp } from '@/stores/app';
import { showSnack } from './snack';

/** «Собери комбо»: burger + fries + nuggets at real catalog prices. */
export function ComboBuilder() {
  const { products } = useCatalog();
  const add = useApp((s) => s.add);
  const fries = products.find((p) => p.slug === 'fries');
  const nuggets = products.find((p) => p.slug === 'nuggets');
  const burgers = products.filter((p) => p.category === 'burgers' && p.variants.some((v) => v.price != null));
  const [pick, setPick] = useState<string | null>(null);
  const burger = burgers.find((b) => b.slug === pick) ?? burgers[0];
  if (!burger || !fries || !nuggets) return null;

  const meat = defaultMeat(burger);
  const bp = burger.variants.find((v) => v.meat === meat)?.price ?? null;
  const fv = fries.variants[0];
  const nv = nuggets.variants[0];
  if (bp == null || !fv || !nv || fv.price == null || nv.price == null) return null;
  const total = bp + fv.price + nv.price;

  const addAll = () => {
    add({ productId: burger.id, meat, qty: 1, extraIds: [] });
    add({ productId: fries.id, meat: fv.meat, qty: 1, extraIds: [] });
    add({ productId: nuggets.id, meat: nv.meat, qty: 1, extraIds: [] });
    toast('Комбо добавлено в корзину');
    showSnack(`${burger.name} + фри + наггетсы`, '/cart', 'В корзину');
  };

  const parts = [
    { id: burger.id, name: burger.name, price: bp, img: variantImage(burger, meat) },
    { id: fries.id, name: fries.name, price: fv.price, img: fries.image },
    { id: nuggets.id, name: nuggets.name, price: nv.price, img: nuggets.image },
  ];

  return (
    <section aria-label="Собери комбо" style={{ margin: '24px 16px 0', borderRadius: 28, background: '#FF6A0A', color: '#fff', padding: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em' }}>СОБЕРИ КОМБО</div>
      <h2 className="disp" style={{ fontSize: 20, fontWeight: 800, marginTop: 6, lineHeight: 1.1 }}>Бургер + фри + наггетсы</h2>

      <div role="radiogroup" aria-label="Выберите бургер" className="scr" style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 14, paddingBottom: 2 }}>
        {burgers.map((b) => {
          const on = b.id === burger.id;
          return (
            <button key={b.id} role="radio" aria-checked={on} className="btn" onClick={() => setPick(b.slug)}
              style={{ flex: 'none', minHeight: 44, padding: '0 14px', borderRadius: 22, fontWeight: 800, fontSize: 13, background: on ? '#141210' : 'rgba(255,255,255,.25)', color: '#fff' }}>{b.name}</button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 14, marginTop: 14 }}>
        {parts.map((x, i) => (
          <div key={x.id} style={{ flex: 1, minWidth: 0, background: '#fff', color: '#141210', borderRadius: 20, padding: 8, textAlign: 'center', position: 'relative' }}>
            {i > 0 && <span aria-hidden="true" style={{ position: 'absolute', left: -12, top: 24, width: 10, textAlign: 'center', fontWeight: 800, color: '#fff', fontSize: 18 }}>+</span>}
            <div style={{ height: 58, background: '#FFF1E0', borderRadius: 14, padding: 3, boxSizing: 'border-box', overflow: 'hidden' }}><ProductImg path={x.img} /></div>
            <div style={{ fontSize: 11, fontWeight: 800, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#C24D00' }}>{fmt(x.price)}</div>
          </div>
        ))}
      </div>

      <button className="btn" onClick={addAll} style={{ marginTop: 16, width: '100%', minHeight: 52, borderRadius: 26, background: '#141210', color: '#fff', fontWeight: 800, fontSize: 16, boxShadow: '0 12px 24px rgba(0,0,0,.25)' }}>Добавить всё · {fmt(total)}</button>
      <Link href={`/product/${burger.slug}`} className="btn" style={{ marginTop: 6, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14, textDecoration: 'underline' }}>Выбрать мясо и добавки</Link>
    </section>
  );
}
