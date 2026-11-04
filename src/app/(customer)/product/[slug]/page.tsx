'use client';
import '@/styles/product.css';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { BoltMark } from '@/components/customer/BoltMark';
import { ChampionHeader } from '@/components/customer/ChampionHeader';
import { HalalBadge } from '@/components/customer/HalalBadge';
import { cleanList, cleanText } from '@/components/customer/halal';
import { NutritionCard } from '@/components/customer/NutritionCard';
import { PricePill } from '@/components/customer/PricePill';
import { PriceTag } from '@/components/customer/PriceTag';
import { PurchaseBar } from '@/components/customer/PurchaseBar';
import { UpsellRow } from '@/components/customer/UpsellRow';
import { Heart, ProductImg, imageUrl, toast } from '@/components/ui';
import { defaultMeat, useMounted, variantImage } from '@/features/catalog/hooks';
import { parseNutrition } from '@/features/catalog/nutrition';
import { unitPrice } from '@/features/cart/pricing';
import { useLang } from '@/i18n/LangProvider';
import { useApp } from '@/stores/app';
import type { Meat } from '@/types/catalog';

/** Brand-native meat labels are always bilingual (kk / ru) regardless of the UI language. */
const MEAT_LABEL: Record<'chicken' | 'beef', { kk: string; ru: string }> = {
  chicken: { kk: 'тауық еті', ru: 'курица' },
  beef: { kk: 'сиыр еті', ru: 'говядина' },
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="pd-h">
      <BoltMark size={20} className="pd-h-bolt" />
      <span>{children}</span>
    </div>
  );
}

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { t, tx, txList, lang } = useLang();
  const { products, extras } = useCatalog();
  const p = products.find((x) => x.slug === slug);
  const add = useApp((s) => s.add);
  const favs = useApp((s) => s.favs);
  const toggleFav = useApp((s) => s.toggleFav);
  const mounted = useMounted();
  const [meat, setMeat] = useState<Meat | null>(null);
  const [ex, setEx] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [addedN, setAddedN] = useState<number | null>(null);

  const back = () => (window.history.length > 1 ? router.back() : router.push('/menu'));

  if (!p) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <div className="disp" style={{ fontSize: 20, fontWeight: 800, marginTop: 40 }}>{t('Товар не найден', 'Тауар табылмады')}</div>
        <button className="btn primary" onClick={() => router.push('/menu')} style={{ marginTop: 20, height: 52, padding: '0 28px', borderRadius: 26 }}>{t('В меню', 'Мәзірге')}</button>
      </div>
    );
  }

  const m = meat ?? defaultMeat(p);
  const variant = p.variants.find((v) => v.meat === m);
  const groupExtras = extras.filter((e) => e.groupId === p.extraGroupId);
  const unit = unitPrice(p, m, ex, extras);
  const fav = mounted && favs.includes(p.id);
  const isChampion = p.slug === 'champion';
  const name = tx(p.name, p.nameKk);
  const description = cleanText(tx(p.description, p.descriptionKk));
  const ingredients = cleanList(txList(p.ingredients, p.ingredientsKk));
  const nutrition = variant ? parseNutrition(lang === 'kk' ? tx(variant.nutrition, variant.nutritionKk) : variant.nutrition) : null;
  const tagline = tx(p.tagline, p.taglineKk);
  const isBurger = p.category === 'burgers';
  const variantLabelRu = variant?.label?.trim() ?? '';
  const variantLabelKk = variant?.labelKk?.trim() || variantLabelRu;

  const addToCart = () => {
    if (unit == null) return;
    add({ productId: p.id, meat: m, qty, extraIds: ex });
    setAddedN(qty);
  };
  // any change of the selection returns the bar to the «add» controls
  const pickMeat = (mm: Meat) => { setMeat(mm); setAddedN(null); };
  const toggleExtra = (id: string, on: boolean) => { setEx(on ? ex.filter((x) => x !== id) : [...ex, id]); setAddedN(null); };
  const changeQty = (n: number) => { setQty(n); setAddedN(null); };

  const backBtn = (
    <button className="btn pd-round-btn pd-round-btn--l" onClick={back} aria-label={t('Назад', 'Артқа')}>←</button>
  );
  const favBtn = (
    <button className="btn pd-round-btn pd-round-btn--r" aria-label={t('В избранное', 'Таңдаулыларға')} aria-pressed={fav}
      onClick={() => toast(toggleFav(p.id) ? t('Добавлено в избранное', 'Таңдаулыларға қосылды') : t('Убрано из избранного', 'Таңдаулылардан алынды'))}>
      <Heart on={fav} />
    </button>
  );
  const photo = (
    <div className="pd-photo">
      <ProductImg path={variantImage(p, m)} alt={name} priority />
    </div>
  );

  return (
    <div className={`pd-page${addedN != null ? ' pd-page--added' : ''}`}>
      <div className="pd-main">
        <div className="pd-hero-col">
          {isChampion ? (
            <ChampionHeader bodyMinHeight={290}>{photo}</ChampionHeader>
          ) : (
            <div className="pd-hero">
              <BoltMark size={210} className="pd-hero-bolt" />
              <BoltMark size={120} tone="ink" className="pd-hero-bolt2" />
              {photo}
            </div>
          )}
          {backBtn}
          {favBtn}
        </div>

        <div className="pd-info">
          <h1 className="disp pd-title">{name}</h1>
          {tagline && <div className="pd-tagline">{tagline}</div>}
          <div className="pd-chips"><HalalBadge dark /></div>
          {description && <div className="pd-desc">{description}</div>}
          {ingredients.length > 0 && (
            <div className="pd-ingr">
              {ingredients.map((i) => <span key={i}>{i}</span>)}
            </div>
          )}

          {!isBurger && (
            <div className="pd-single-price">
              {variantLabelRu ? (
                <PricePill kk={variantLabelKk} ru={variantLabelRu} price={unit} size="lg" />
              ) : (
                <PriceTag amount={unit} size={22} color="#141210" />
              )}
            </div>
          )}

          {nutrition && <NutritionCard n={nutrition} />}

          {isBurger && (
            <>
              <SectionTitle>{t('Мясо', 'Ет түрі')}</SectionTitle>
              <div role="radiogroup" aria-label={t('Мясо', 'Ет түрі')} className="pd-meats">
                {(['chicken', 'beef'] as const).map((mm) => {
                  const v = p.variants.find((x) => x.meat === mm);
                  const has = v?.price != null;
                  const act = m === mm && has;
                  return (
                    <button key={mm} type="button" role="radio" aria-checked={act} disabled={!has} className="btn pd-meat" onClick={() => has && pickMeat(mm)}>
                      <PricePill kk={MEAT_LABEL[mm].kk} ru={MEAT_LABEL[mm].ru} price={v?.price ?? null} size="lg" selected={act} />
                      {act && <span className="pd-meat-ok" aria-hidden="true">✓</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {groupExtras.length > 0 && (
            <>
              <SectionTitle>{t('Дополнительно', 'Қосымша')}</SectionTitle>
              <div className="pd-extras">
                {groupExtras.map((e) => {
                  const on = ex.includes(e.id);
                  const exName = tx(e.name, e.nameKk);
                  return (
                    <button key={e.id} type="button" role="checkbox" aria-checked={on} className="btn pd-ex" onClick={() => toggleExtra(e.id, on)}>
                      <span className="pd-ex-tile">
                        {imageUrl(e.image) ? <ProductImg path={e.image} fit="cover" /> : <BoltMark size={30} className="pd-ex-bolt" />}
                      </span>
                      <span className="pd-ex-name">{exName}</span>
                      <PriceTag amount={e.price} prefix="+" size={14} color="#141210" />
                      <span className="pd-ex-box" aria-hidden="true">{on ? '✓' : ''}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <PurchaseBar
            total={unit == null ? null : unit * qty}
            qty={qty}
            onQty={changeQty}
            onAdd={addToCart}
            added={addedN != null ? { n: addedN, name } : null}
            onContinue={back}
            onCart={() => router.push('/cart')}
          />
        </div>
      </div>

      <div className="pd-upsell">
        <UpsellRow product={p} />
      </div>
    </div>
  );
}
