'use client';
import { useId, useState } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { ProductImg, toast } from '@/components/ui';
import { defaultMeat, pillLabel, priceFromL, variantImage } from '@/features/catalog/hooks';
import { useLang } from '@/i18n/LangProvider';
import { useApp } from '@/stores/app';
import type { Meat, Product, Variant } from '@/types/catalog';
import { PricePill } from './PricePill';
import { PriceTag, PriceText } from './PriceTag';
import '@/styles/home.css';

const firstPriced = (p: Product): Variant | undefined => p.variants.find((v) => v.price != null);

/** One radio card (photo + name + price). Native radio input => keyboard/arrow navigation and screen reader support for free. */
function Choice({ group, value, checked, onPick, img, fit, title, sub, children }: {
  group: string; value: string; checked: boolean; onPick: () => void; img: string | null | undefined;
  fit?: 'contain' | 'cover'; title: string; sub?: string | null; children: React.ReactNode;
}) {
  return (
    <label className="cb-opt">
      <input type="radio" className="cb-radio" name={group} value={value} checked={checked} onChange={onPick} />
      <span className="cb-face">
        <span className="cb-img"><ProductImg path={img} fit={fit} /></span>
        <span className="cb-name">{title}</span>
        {sub ? <span className="cb-sub">{sub}</span> : null}
        <span className="cb-price">{children}</span>
        <span aria-hidden="true" className="cb-tick">✓</span>
      </span>
    </label>
  );
}

/**
 * «Собери комбо»: ONE burger (meat of your choice) + ONE side (fries or nuggets) + ONE drink.
 * Total = plain sum of the three catalog prices; nothing is preselected and the button stays disabled until all three are chosen.
 */
export function ComboBuilder() {
  const { products } = useCatalog();
  const { t, tx, lang } = useLang();
  const add = useApp((s) => s.add);
  const uid = useId();
  const [burgerId, setBurgerId] = useState<string | null>(null);
  const [meatPick, setMeatPick] = useState<Meat | null>(null);
  const [sideId, setSideId] = useState<string | null>(null);
  const [drinkId, setDrinkId] = useState<string | null>(null);

  const burgers = products.filter((p) => p.category === 'burgers' && firstPriced(p));
  const sides = ['fries', 'nuggets'].map((s) => products.find((p) => p.slug === s)).filter((p): p is Product => !!p && !!firstPriced(p));
  const drinks = products.filter((p) => p.category === 'drinks' && firstPriced(p));
  if (!burgers.length || !sides.length || !drinks.length) return null;

  const burger = burgers.find((b) => b.id === burgerId) ?? null;
  const pricedMeats = burger ? burger.variants.filter((v) => v.price != null) : [];
  const bVariant = burger ? (pricedMeats.find((v) => v.meat === meatPick) ?? pricedMeats.find((v) => v.meat === defaultMeat(burger)) ?? pricedMeats[0]) : undefined;
  const side = sides.find((p) => p.id === sideId) ?? null;
  const sVariant = side ? firstPriced(side) : undefined;
  const drink = drinks.find((p) => p.id === drinkId) ?? null;
  const dVariant = drink ? firstPriced(drink) : undefined;

  const ready = !!(burger && bVariant && side && sVariant && drink && dVariant);
  const total = (bVariant?.price ?? 0) + (sVariant?.price ?? 0) + (dVariant?.price ?? 0);
  const chosen = [bVariant, sVariant, dVariant].filter(Boolean).length;

  const missing = [
    !burger && t('бургер', 'бургер'),
    !side && t('фри или наггетсы', 'фри немесе наггетс'),
    !drink && t('напиток', 'сусын'),
  ].filter((x): x is string => !!x);

  const addCombo = () => {
    if (!burger || !bVariant || !side || !sVariant || !drink || !dVariant) return;
    add({ productId: burger.id, meat: bVariant.meat, qty: 1, extraIds: [] });
    add({ productId: side.id, meat: sVariant.meat, qty: 1, extraIds: [] });
    add({ productId: drink.id, meat: dVariant.meat, qty: 1, extraIds: [] });
    toast(t('Комбо добавлено в корзину', 'Комбо себетке қосылды'));
  };

  const pickBurger = (b: Product) => { setBurgerId(b.id); setMeatPick(defaultMeat(b)); };
  const meatLabel = bVariant ? pillLabel(bVariant) : null;

  const rows: { key: string; step: string; name: string | null; price: number | null }[] = [
    { key: 'b', step: t('Бургер', 'Бургер'), name: burger ? `${tx(burger.name, burger.nameKk)}${meatLabel && bVariant?.meat !== 'one' ? ` · ${lang === 'kk' ? meatLabel.kk : meatLabel.ru}` : ''}` : null, price: bVariant?.price ?? null },
    { key: 's', step: t('Фри или наггетсы', 'Фри немесе наггетс'), name: side ? tx(side.name, side.nameKk) : null, price: sVariant?.price ?? null },
    { key: 'd', step: t('Напиток', 'Сусын'), name: drink ? tx(drink.name, drink.nameKk) : null, price: dVariant?.price ?? null },
  ];

  return (
    <section aria-label={t('Собери комбо', 'Комбо жинаңыз')} className="hm-combo">
      <span aria-hidden="true" className="hm-bolt hm-combo-bolt" />
      <div className="cb-eyebrow">{t('СОБЕРИ КОМБО', 'КОМБО ЖИНАҢЫЗ')}</div>
      <h2 className="disp cb-title">{t('Бургер + фри или наггетсы + напиток', 'Бургер + фри немесе наггетс + сусын')}</h2>

      <div className="cb-steps">
        {/* 1. burger (+ meat) */}
        <div className="cb-step" role="group" aria-labelledby={`${uid}-h1`}>
          <h3 className="cb-step-h" id={`${uid}-h1`}><span aria-hidden="true" className="disp cb-n">1</span>{t('Бургер', 'Бургер')}</h3>
          <div className="scr cb-choices">
            {burgers.map((b) => (
              <Choice key={b.id} group={`${uid}-burger`} value={b.id} checked={b.id === burgerId} onPick={() => pickBurger(b)}
                img={variantImage(b, defaultMeat(b))} title={tx(b.name, b.nameKk)}>
                <PriceText text={priceFromL(b, lang)} size={12} />
              </Choice>
            ))}
          </div>
          {burger && pricedMeats.length > 1 && (
            <div className="cb-meats" role="radiogroup" aria-label={t('Выберите мясо', 'Ет түрін таңдаңыз')}>
              {pricedMeats.map((v) => {
                const l = pillLabel(v);
                const on = bVariant?.id === v.id;
                return (
                  <label key={v.id} className="cb-meat">
                    <input type="radio" className="cb-radio" name={`${uid}-meat`} value={v.meat} checked={on} onChange={() => setMeatPick(v.meat)} />
                    <span className="cb-meat-face"><PricePill kk={l.kk} ru={l.ru} price={v.price} selected={on} /></span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. fries or nuggets */}
        <div className="cb-step" role="group" aria-labelledby={`${uid}-h2`}>
          <h3 className="cb-step-h" id={`${uid}-h2`}><span aria-hidden="true" className="disp cb-n">2</span>{t('Фри или наггетсы', 'Фри немесе наггетс')}</h3>
          <div className="scr cb-choices">
            {sides.map((p) => {
              const v = firstPriced(p);
              return (
                <Choice key={p.id} group={`${uid}-side`} value={p.id} checked={p.id === sideId} onPick={() => setSideId(p.id)}
                  img={p.image} title={tx(p.name, p.nameKk)} sub={v ? tx(v.label, v.labelKk) : null}>
                  <PriceTag amount={v?.price ?? null} size={13} />
                </Choice>
              );
            })}
          </div>
        </div>

        {/* 3. drink */}
        <div className="cb-step" role="group" aria-labelledby={`${uid}-h3`}>
          <h3 className="cb-step-h" id={`${uid}-h3`}><span aria-hidden="true" className="disp cb-n">3</span>{t('Напиток', 'Сусын')}</h3>
          <div className="scr cb-choices">
            {drinks.map((p) => (
              <Choice key={p.id} group={`${uid}-drink`} value={p.id} checked={p.id === drinkId} onPick={() => setDrinkId(p.id)}
                img={p.image} title={tx(p.name, p.nameKk)}>
                <PriceTag amount={firstPriced(p)?.price ?? null} size={13} />
              </Choice>
            ))}
          </div>
        </div>
      </div>

      <div className="cb-sum">
        <div className="cb-sum-h">{t('Ваше комбо', 'Сіздің комбоңыз')}</div>
        <ul className="cb-lines">
          {rows.map((r) => (
            <li key={r.key} className="cb-line">
              <span className="cb-line-k">{r.step}</span>
              <span className={`cb-line-v${r.name ? '' : ' cb-line-v--empty'}`}>{r.name ?? t('не выбрано', 'таңдалмаған')}</span>
              <span className="cb-line-p">{r.price != null ? <PriceTag amount={r.price} size={14} /> : <span aria-hidden="true">—</span>}</span>
            </li>
          ))}
        </ul>
        <div className="cb-side">
        <div className="cb-total">
          <span>{t('Итого', 'Барлығы')}</span>
          {chosen > 0 ? <PriceTag amount={total} tone="ink" size={22} /> : <span aria-hidden="true">—</span>}
        </div>
        <button type="button" className="btn cb-add" disabled={!ready} onClick={addCombo} aria-describedby={ready ? undefined : `${uid}-hint`}>
          {t('Добавить комбо в корзину', 'Комбоны себетке қосу')}
          {ready && <> · <PriceTag amount={total} size={16} color="#fff" /></>}
        </button>
        {!ready && <div className="cb-hint" id={`${uid}-hint`}>{t('Осталось выбрать: ', 'Таңдау керек: ')}{missing.join(', ')}</div>}
        </div>
      </div>
    </section>
  );
}
