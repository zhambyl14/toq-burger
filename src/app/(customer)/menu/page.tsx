'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { HalalBadge } from '@/components/customer/HalalBadge';
import { useQuickAdd } from '@/components/customer/useQuickAdd';
import { ProductImg } from '@/components/ui';
import { defaultMeat, meatsLabel, priceFrom, variantImage } from '@/features/catalog/hooks';
import { fmt } from '@/lib/money';
import type { Product } from '@/types/catalog';

const CATS: [string, string][] = [['all', 'Всё меню'], ['beef', 'С говядиной'], ['chicken', 'С курицей'], ['sides', 'Картофель и закуски'], ['sauces', 'Соусы'], ['drinks', 'Напитки'], ['combo', 'Комбо']];

function SectionTitle({ children, count }: { children: React.ReactNode; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '10px 0 -2px' }}>
      <h2 className="disp" style={{ fontSize: 18, fontWeight: 800 }}>{children}</h2>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#6B6258' }}>{count}</span>
    </div>
  );
}

function Menu() {
  const sp = useSearchParams();
  const { products } = useCatalog();
  const quickAdd = useQuickAdd();
  const initial = sp.get('cat');
  const [cat, setCat] = useState(CATS.some(([c]) => c === initial) && initial ? initial : 'all');
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const match = (n: string) => !query || n.toLowerCase().includes(query);
  const showAll = !!query || cat === 'all';

  // search spans every category; otherwise filter by the selected chip
  const burgers = products.filter((p) => p.category === 'burgers' && match(p.name) && (showAll
    || (cat === 'beef' && p.variants.some((v) => v.meat === 'beef')) || (cat === 'chicken' && p.variants.some((v) => v.meat === 'chicken'))));
  const sides = products.filter((p) => p.category === 'sides' && match(p.name) && (showAll || cat === 'sides'));
  const sauces = products.filter((p) => p.category === 'sauces' && match(p.name) && (showAll || cat === 'sauces'));
  const drinks = products.filter((p) => p.category === 'drinks' && match(p.name) && (showAll || cat === 'drinks'));
  const nothing = cat !== 'combo' && !burgers.length && !sides.length && !sauces.length && !drinks.length;
  const sections = [burgers.length ? 1 : 0, sides.length, sauces.length, drinks.length].filter(Boolean).length;
  const titled = sections > 1 || showAll;

  const row = (s: Product) => {
    const v = s.variants[0];
    const priced = v?.price != null;
    return (
      <div key={s.id} style={{ display: 'flex', gap: 14, alignItems: 'center', background: '#fff', borderRadius: 24, padding: 12, boxShadow: '0 8px 22px rgba(120,60,0,.08)', opacity: priced ? 1 : 0.92 }}>
        <div style={{ flex: 'none', width: 64, height: 64, borderRadius: 18, background: '#FFF1E0', padding: 4, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#C24D00', overflow: 'hidden' }}>
          {s.image ? <ProductImg path={s.image} /> : s.tagline}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{s.name}</div>
          {s.tagline && s.image && <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 1 }}>{s.tagline}</div>}
          {priced ? <div style={{ fontWeight: 800, color: '#C24D00', marginTop: 3 }}>{fmt(v.price!)}</div>
            : <span style={{ display: 'inline-block', marginTop: 4, padding: '4px 10px', borderRadius: 10, background: '#F3EADF', fontSize: 11, fontWeight: 800, color: '#6B6258' }}>Цена уточняется</span>}
        </div>
        {priced ? (
          <button className="btn" aria-label={`Добавить ${s.name}`} onClick={() => quickAdd(s)}
            style={{ flex: 'none', width: 44, height: 44, borderRadius: '50%', background: '#FF6A0A', color: '#fff', fontSize: 24, fontWeight: 800, boxShadow: '0 8px 16px rgba(255,106,10,.35)' }}>+</button>
        ) : (
          <div style={{ flex: 'none', padding: '6px 10px', borderRadius: 12, background: '#F3EADF', fontSize: 11, fontWeight: 800, color: '#6B6258' }}>СКОРО</div>
        )}
      </div>
    );
  };

  return (
    <div className="scr-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingBottom: 80 }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 30, background: '#FFF6EC', boxShadow: '0 6px 14px -8px rgba(120,60,0,.18)' }}>
        <div style={{ padding: '16px 16px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <h1 className="disp" style={{ fontSize: 24, fontWeight: 800 }}>Меню</h1>
            <HalalBadge dark />
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти бургер, фри, напиток…" aria-label="Поиск по меню" type="search" autoFocus={sp.get('focus') === '1'}
            style={{ marginTop: 12, width: '100%', boxSizing: 'border-box', height: 48, borderRadius: 16, border: '2px solid transparent', background: '#fff', padding: '0 16px', fontSize: 15, fontWeight: 600, outline: 'none' }} />
        </div>
        <div className="scr" role="tablist" aria-label="Категории" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 16px 12px', flex: 'none' }}>
          {CATS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={cat === id} className="btn" onClick={() => setCat(id)}
              style={{ flex: 'none', minHeight: 44, padding: '0 16px', borderRadius: 22, fontWeight: 800, fontSize: 14, background: cat === id ? '#141210' : '#fff', color: cat === id ? '#fff' : '#141210' }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '10px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {burgers.length > 0 && (
          <>
            {titled && <SectionTitle count={burgers.length}>Бургеры</SectionTitle>}
            <div className="mgrid">
              {burgers.map((b) => {
                const classic = b.slug === 'classic';
                const meats = meatsLabel(b);
                return (
                  <div key={b.id} style={{ background: '#fff', borderRadius: 26, padding: 10, boxShadow: '0 8px 22px rgba(120,60,0,.08)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                    <Link href={`/product/${b.slug}`} className="btn" aria-label={b.name} style={{ display: 'block', height: 112, background: classic ? '#FF6A0A' : '#FFF1E0', borderRadius: 20, padding: 5, boxSizing: 'border-box', overflow: 'hidden' }}>
                      <ProductImg path={variantImage(b, defaultMeat(b))} fit={classic ? 'cover' : 'contain'} />
                    </Link>
                    <Link href={`/product/${b.slug}`} style={{ textDecoration: 'none', color: 'inherit', padding: '10px 4px 0', flex: 1 }}>
                      <div className="disp" style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.15 }}>{b.name}</div>
                      <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 3, lineHeight: 1.3 }}>{meats || b.tagline}</div>
                    </Link>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 0 4px' }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: '#C24D00' }}>{priceFrom(b)}</div>
                      <button className="btn" aria-label={`Добавить в корзину: ${b.name}`} onClick={() => quickAdd(b)}
                        style={{ flex: 'none', width: 44, height: 44, borderRadius: '50%', background: '#FF6A0A', color: '#fff', fontSize: 24, fontWeight: 800, boxShadow: '0 8px 16px rgba(255,106,10,.35)' }}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {sides.length > 0 && (<>{titled && <SectionTitle count={sides.length}>Картофель и закуски</SectionTitle>}{sides.map(row)}</>)}
        {sauces.length > 0 && (<>{titled && <SectionTitle count={sauces.length}>Соусы</SectionTitle>}{sauces.map(row)}</>)}
        {drinks.length > 0 && (<>{titled && <SectionTitle count={drinks.length}>Напитки</SectionTitle>}{drinks.map(row)}</>)}
        {cat === 'combo' && !query && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6B6258' }}>
            <div className="disp" style={{ fontSize: 18, fontWeight: 800, color: '#141210' }}>Комбо скоро</div>
            <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.4 }}>Пока собирайте своё: бургер, фри и наггетсы.</div>
            <Link href="/" className="btn primary" style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', minHeight: 48, padding: '0 24px', borderRadius: 24, textDecoration: 'none' }}>На главную</Link>
          </div>
        )}
        {nothing && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6B6258' }}>
            <div className="disp" style={{ fontSize: 18, fontWeight: 800, color: '#141210' }}>Ничего не найдено</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Попробуйте другой запрос.</div>
            <button className="btn dark" onClick={() => { setQ(''); setCat('all'); }} style={{ marginTop: 16, minHeight: 48, padding: '0 24px', borderRadius: 24 }}>Показать всё меню</button>
          </div>
        )}
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
