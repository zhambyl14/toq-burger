'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { ProductImg } from '@/components/ui';
import { defaultMeat, variantImage } from '@/features/catalog/hooks';
import { useLang } from '@/i18n/LangProvider';
import { useApp } from '@/stores/app';
import { PriceTag } from './PriceTag';
import { showSnack } from './snack';
import '@/styles/home.css';

/** «Собери комбо»: burger + fries + nuggets at real catalog prices. */
export function ComboBuilder() {
  const { products } = useCatalog();
  const { t, tx } = useLang();
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
    showSnack(t(`${tx(burger.name, burger.nameKk)} + фри + наггетсы`, `${tx(burger.name, burger.nameKk)} + фри + наггетс`), '/cart', t('В корзину', 'Себетке'));
  };

  const parts = [
    { id: burger.id, name: tx(burger.name, burger.nameKk), price: bp, img: variantImage(burger, meat) },
    { id: fries.id, name: tx(fries.name, fries.nameKk), price: fv.price, img: fries.image },
    { id: nuggets.id, name: tx(nuggets.name, nuggets.nameKk), price: nv.price, img: nuggets.image },
  ];

  return (
    <section aria-label={t('Собери комбо', 'Комбо жинаңыз')} className="hm-combo">
      <span aria-hidden="true" className="hm-bolt hm-combo-bolt" />
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em' }}>{t('СОБЕРИ КОМБО', 'КОМБО ЖИНАҢЫЗ')}</div>
      <h2 className="disp" style={{ fontSize: 'clamp(18px, 5vw, 22px)', fontWeight: 800, marginTop: 6, lineHeight: 1.1, maxWidth: '82%' }}>{t('Бургер + фри + наггетсы', 'Бургер + фри + наггетс')}</h2>

      <div role="radiogroup" aria-label={t('Выберите бургер', 'Бургерді таңдаңыз')} className="scr hm-combo-pick">
        {burgers.map((b) => {
          const on = b.id === burger.id;
          return (
            <button key={b.id} role="radio" aria-checked={on} className="btn" onClick={() => setPick(b.slug)}
              style={{ flex: 'none', minHeight: 44, padding: '0 14px', borderRadius: 22, fontWeight: 800, fontSize: 13, background: on ? '#141210' : 'rgba(255,255,255,.25)', color: '#fff' }}>{tx(b.name, b.nameKk)}</button>
          );
        })}
      </div>

      <div className="hm-combo-parts">
        {parts.map((x, i) => (
          <div key={x.id} className="hm-combo-part">
            {i > 0 && <span aria-hidden="true" className="hm-combo-plus">+</span>}
            <div className="hm-combo-part-i"><ProductImg path={x.img} /></div>
            <div className="hm-combo-n" style={{ fontWeight: 800, marginTop: 6, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</div>
            <div style={{ display: 'flex', justifyContent: 'center' }}><PriceTag amount={x.price} size={12} color="#C24D00" /></div>
          </div>
        ))}
      </div>

      <button className="btn" onClick={addAll} style={{ marginTop: 16, width: '100%', minHeight: 52, borderRadius: 26, background: '#141210', color: '#fff', fontWeight: 800, fontSize: 16, boxShadow: '0 12px 24px rgba(0,0,0,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>{t('Добавить всё', 'Барлығын қосу')} · <PriceTag amount={total} size={16} color="#fff" /></button>
      <Link href={`/product/${burger.slug}`} className="btn" style={{ marginTop: 6, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14, textDecoration: 'underline' }}>{t('Выбрать мясо и добавки', 'Ет пен қосымшаларды таңдау')}</Link>
    </section>
  );
}
