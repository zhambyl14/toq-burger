'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { BoltMark } from '@/components/customer/BoltMark';
import { ComboBuilder } from '@/components/customer/ComboBuilder';
import { HalalBadge } from '@/components/customer/HalalBadge';
import { useQuickAdd } from '@/components/customer/useQuickAdd';
import { VariantPills } from '@/components/customer/VariantPills';
import { ProductImg } from '@/components/ui';
import { defaultMeat, variantImage } from '@/features/catalog/hooks';
import { useLang } from '@/i18n/LangProvider';
import type { Product } from '@/types/catalog';
import '@/styles/home.css';

const CAT_IDS = ['all', 'beef', 'chicken', 'sides', 'sauces', 'drinks', 'combo'];

function SectionTitle({ children, count }: { children: React.ReactNode; count: number }) {
  return (
    <div className="hm-sect-title">
      <h2 className="disp hm-h2"><BoltMark size={22} />{children}<span className="hm-h2-count">{count}</span></h2>
    </div>
  );
}

function Menu() {
  const sp = useSearchParams();
  const { products } = useCatalog();
  const { t, tx } = useLang();
  const quickAdd = useQuickAdd();
  const initial = sp.get('cat');
  const [cat, setCat] = useState(CAT_IDS.includes(initial ?? '') && initial ? initial : 'all');
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  // search matches both the Russian and the Kazakh name
  const match = (p: Product) => !query || p.name.toLowerCase().includes(query) || (p.nameKk ?? '').toLowerCase().includes(query);
  const showAll = !!query || cat === 'all';

  const cats: [string, string][] = [
    ['all', t('Всё меню', 'Бүкіл мәзір')], ['beef', t('С говядиной', 'Сиыр етімен')], ['chicken', t('С курицей', 'Тауық етімен')],
    ['sides', t('Картофель и закуски', 'Картоп және тіскебасарлар')], ['sauces', t('Соусы', 'Тұздықтар')], ['drinks', t('Напитки', 'Сусындар')], ['combo', t('Комбо', 'Комбо')],
  ];

  // search spans every category; otherwise filter by the selected chip
  const burgers = products.filter((p) => p.category === 'burgers' && match(p) && (showAll
    || (cat === 'beef' && p.variants.some((v) => v.meat === 'beef')) || (cat === 'chicken' && p.variants.some((v) => v.meat === 'chicken'))));
  const sides = products.filter((p) => p.category === 'sides' && match(p) && (showAll || cat === 'sides'));
  const sauces = products.filter((p) => p.category === 'sauces' && match(p) && (showAll || cat === 'sauces'));
  const drinks = products.filter((p) => p.category === 'drinks' && match(p) && (showAll || cat === 'drinks'));
  const empty = products.length === 0;
  const nothing = !empty && cat !== 'combo' && !burgers.length && !sides.length && !sauces.length && !drinks.length;
  const sections = [burgers.length ? 1 : 0, sides.length, sauces.length, drinks.length].filter(Boolean).length;
  const titled = sections > 1 || showAll;

  const card = (s: Product, burger: boolean) => {
    const priced = s.variants.some((v) => v.price != null);
    const name = tx(s.name, s.nameKk);
    const tag = tx(s.tagline, s.taglineKk);
    const classic = s.slug === 'classic';
    const img = burger ? variantImage(s, defaultMeat(s)) : s.image;
    return (
      <article key={s.id} className={`hm-card${burger ? '' : ' hm-card--small'}`} style={{ opacity: priced ? 1 : 0.94 }}>
        <Link href={`/product/${s.slug}`} className="btn hm-card-img" tabIndex={-1} aria-hidden="true" style={{ background: classic ? '#FF6A0A' : '#FFF1E0' }}>
          <ProductImg path={img} fit={classic ? 'cover' : 'contain'} />
          {s.slug === 'champion' && <span aria-hidden="true" className="hm-badge-new">NEW</span>}
          {!priced && <span aria-hidden="true" className="hm-card-soon">{t('СКОРО', 'ЖАҚЫНДА')}</span>}
        </Link>
        <Link href={`/product/${s.slug}`} className="hm-card-body">
          <span className="disp hm-card-name">{name}</span>
          {tag && <span className="hm-card-tag">{tag}</span>}
        </Link>
        <VariantPills product={s} className="hm-pills hm-card-pills" />
        {priced && (
          <button className="btn hm-add" aria-label={`${t('Добавить в корзину', 'Себетке қосу')}: ${name}`} onClick={() => quickAdd(s)}>+</button>
        )}
      </article>
    );
  };

  return (
    <div className="scr-in hm-menu">
      <div className="hm-menu-head">
        <div className="hm-menu-head-in">
          <div className="hm-menu-title">
            <h1 className="disp hm-menu-h1"><BoltMark size={30} />{t('Меню', 'Мәзір')}</h1>
            <HalalBadge dark />
          </div>
          <input className="field hm-search-in" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Найти бургер, фри, напиток…', 'Бургер, фри, сусын іздеу…')} aria-label={t('Поиск по меню', 'Мәзірден іздеу')} type="search" autoFocus={sp.get('focus') === '1'} />
        </div>
        <div className="scr hm-chips-row" role="group" aria-label={t('Категории', 'Санаттар')}>
          {cats.map(([id, label]) => (
            <button key={id} aria-pressed={cat === id} className="btn hm-chip" onClick={() => setCat(id)}
              style={{ background: cat === id ? '#141210' : '#fff', color: cat === id ? '#fff' : '#141210' }}>{label}</button>
          ))}
        </div>
      </div>

      <div className="hm-menu-layout">
        <nav className="hm-side" aria-label={t('Категории', 'Санаттар')}>
          {cats.map(([id, label]) => (
            <button key={id} aria-pressed={cat === id} className="btn hm-side-btn" onClick={() => setCat(id)}>
              <span aria-hidden="true" className="hm-bolt" />{label}
            </button>
          ))}
        </nav>

        <div className="hm-menu-main">
          {burgers.length > 0 && (
            <>
              {titled && <SectionTitle count={burgers.length}>{t('Бургеры', 'Бургерлер')}</SectionTitle>}
              <div className="hm-grid">{burgers.map((b) => card(b, true))}</div>
            </>
          )}
          {sides.length > 0 && (<>{titled && <SectionTitle count={sides.length}>{t('Картофель и закуски', 'Картоп және тіскебасарлар')}</SectionTitle>}<div className="hm-grid">{sides.map((s) => card(s, false))}</div></>)}
          {sauces.length > 0 && (<>{titled && <SectionTitle count={sauces.length}>{t('Соусы', 'Тұздықтар')}</SectionTitle>}<div className="hm-grid">{sauces.map((s) => card(s, false))}</div></>)}
          {drinks.length > 0 && (<>{titled && <SectionTitle count={drinks.length}>{t('Напитки', 'Сусындар')}</SectionTitle>}<div className="hm-grid">{drinks.map((s) => card(s, false))}</div></>)}
          {cat === 'combo' && !query && <div className="hm-combo-wrap"><ComboBuilder /></div>}
          {empty && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6B6258' }}>
              <div className="disp" style={{ fontSize: 18, fontWeight: 800, color: '#141210' }}>{t('Меню пока недоступно', 'Мәзір әзірге қолжетімсіз')}</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>{t('Загляните чуть позже.', 'Сәл кейінірек қараңыз.')}</div>
            </div>
          )}
          {nothing && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6B6258' }}>
              <div className="disp" style={{ fontSize: 18, fontWeight: 800, color: '#141210' }}>{t('Ничего не найдено', 'Ештеңе табылмады')}</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>{t('Попробуйте другой запрос.', 'Басқа сұраныс жасап көріңіз.')}</div>
              <button className="btn dark" onClick={() => { setQ(''); setCat('all'); }} style={{ marginTop: 16, minHeight: 48, padding: '0 24px', borderRadius: 24 }}>{t('Показать всё меню', 'Бүкіл мәзірді көрсету')}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MenuPage() {
  return (
    <Suspense>
      <Menu />
    </Suspense>
  );
}
