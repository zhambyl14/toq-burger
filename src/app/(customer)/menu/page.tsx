'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { ProductImg, toast } from '@/components/ui';
import { defaultMeat, meatsLabel, priceFrom, variantImage } from '@/features/catalog/hooks';
import { useApp } from '@/stores/app';
import { fmt } from '@/lib/money';

const CATS: [string, string][] = [['all', 'Все бургеры'], ['beef', 'С говядиной'], ['chicken', 'С курицей'], ['sides', 'Картофель и закуски'], ['sauces', 'Соусы'], ['drinks', 'Напитки'], ['combo', 'Комбо']];

function Menu() {
  const sp = useSearchParams();
  const { products } = useCatalog();
  const add = useApp((s) => s.add);
  const [cat, setCat] = useState(CATS.some(([c]) => c === sp.get('cat')) ? sp.get('cat')! : 'all');
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const match = (n: string) => !query || n.toLowerCase().includes(query);

  // search spans every category; otherwise filter by the selected chip
  const burgers = products.filter((p) => p.category === 'burgers' && match(p.name) && (query || cat === 'all'
    || (cat === 'beef' && p.variants.some((v) => v.meat === 'beef')) || (cat === 'chicken' && p.variants.some((v) => v.meat === 'chicken'))));
  const sides = products.filter((p) => (p.category === 'sides' || p.category === 'sauces') && match(p.name)
    && (query || (cat === 'sides' && p.category === 'sides') || (cat === 'sauces' && p.category === 'sauces')));
  const drinks = products.filter((p) => p.category === 'drinks' && match(p.name) && (query || cat === 'drinks'));
  const nothing = cat !== 'combo' && !burgers.length && !sides.length && !drinks.length;

  return (
    <div className="scr-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '16px 16px 8px' }}>
        <h1 className="disp" style={{ fontSize: 24, fontWeight: 800 }}>Меню</h1>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти бургер…" aria-label="Поиск по меню" type="search" autoFocus={sp.get('focus') === '1'}
          style={{ marginTop: 12, width: '100%', boxSizing: 'border-box', height: 48, borderRadius: 16, border: '2px solid transparent', background: '#fff', padding: '0 16px', fontSize: 15, fontWeight: 600, outline: 'none' }} />
      </div>
      <div className="scr" role="tablist" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 16px 12px', flex: 'none' }}>
        {CATS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={cat === id} className="btn" onClick={() => setCat(id)}
            style={{ flex: 'none', minHeight: 44, padding: '0 16px', borderRadius: 22, fontWeight: 800, fontSize: 14, background: cat === id ? '#141210' : '#fff', color: cat === id ? '#fff' : '#141210' }}>{label}</button>
        ))}
      </div>
      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {burgers.map((b) => (
          <Link key={b.id} href={`/product/${b.slug}`} className="btn" style={{ display: 'flex', gap: 14, alignItems: 'center', textAlign: 'left', background: '#fff', borderRadius: 24, padding: 12, boxShadow: '0 8px 22px rgba(120,60,0,.08)', width: '100%', textDecoration: 'none', boxSizing: 'border-box' }}>
            <div style={{ flex: 'none', width: 104, height: 96, background: b.slug === 'classic' ? '#FF6A0A' : '#FFF1E0', borderRadius: 18, padding: 4, boxSizing: 'border-box', overflow: 'hidden' }}>
              <ProductImg path={variantImage(b, defaultMeat(b))} fit={b.slug === 'classic' ? 'cover' : 'contain'} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="disp" style={{ fontSize: 15, fontWeight: 800 }}>{b.name}</div>
              <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 3, lineHeight: 1.3 }}>{meatsLabel(b)}</div>
              <div style={{ fontWeight: 800, fontSize: 15, marginTop: 8, color: '#C24D00' }}>{priceFrom(b)}</div>
            </div>
          </Link>
        ))}
        {sides.map((s) => {
          const v = s.variants[0];
          return (
            <div key={s.id} style={{ display: 'flex', gap: 14, alignItems: 'center', background: '#fff', borderRadius: 24, padding: 14, boxShadow: '0 8px 22px rgba(120,60,0,.08)' }}>
              <div style={{ flex: 'none', width: 64, height: 64, borderRadius: 18, background: '#FFF1E0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#C24D00', overflow: 'hidden' }}>
                {s.image ? <ProductImg path={s.image} /> : s.tagline}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{s.name}</div>
                <div style={{ fontWeight: 800, color: '#C24D00', marginTop: 3 }}>{v?.price != null ? fmt(v.price) : 'Цена уточняется'}</div>
              </div>
              {v?.price != null && (
                <button className="btn" aria-label={`Добавить ${s.name}`} onClick={() => { add({ productId: s.id, meat: v.meat, qty: 1, extraIds: [] }); toast(`${s.name} добавлен`); }}
                  style={{ width: 44, height: 44, borderRadius: '50%', background: '#FF6A0A', color: '#fff', fontSize: 24, fontWeight: 800 }}>+</button>
              )}
            </div>
          );
        })}
        {drinks.map((d) => {
          const v = d.variants[0];
          const priced = v?.price != null;
          return (
            <div key={d.id} style={{ display: 'flex', gap: 14, alignItems: 'center', background: '#fff', borderRadius: 24, padding: 14 }}>
              <div style={{ flex: 'none', width: 64, height: 64, borderRadius: 18, background: '#FFF1E0', padding: 4, boxSizing: 'border-box' }}><ProductImg path={d.image} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{d.name}</div>
                <div style={{ fontSize: 12, color: priced ? '#C24D00' : '#6B6258', fontWeight: 700, marginTop: 3 }}>{priced ? fmt(v.price!) : 'Цена уточняется'}</div>
              </div>
              {priced ? (
                <button className="btn" aria-label={`Добавить ${d.name}`} onClick={() => { add({ productId: d.id, meat: v.meat, qty: 1, extraIds: [] }); toast(`${d.name} добавлен`); }}
                  style={{ width: 44, height: 44, borderRadius: '50%', background: '#FF6A0A', color: '#fff', fontSize: 24, fontWeight: 800 }}>+</button>
              ) : (
                <div style={{ padding: '6px 10px', borderRadius: 12, background: '#F3EADF', fontSize: 11, fontWeight: 800, color: '#6B6258' }}>СКОРО</div>
              )}
            </div>
          );
        })}
        {cat === 'combo' && !query && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6B6258' }}>
            <div className="disp" style={{ fontSize: 18, fontWeight: 800, color: '#141210' }}>Комбо скоро</div>
            <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.4 }}>Наборы создаются админом из позиций меню. Здесь пока пусто.</div>
          </div>
        )}
        {nothing && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6B6258' }}>
            <div className="disp" style={{ fontSize: 18, fontWeight: 800, color: '#141210' }}>Ничего не найдено</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Попробуйте другой запрос.</div>
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
