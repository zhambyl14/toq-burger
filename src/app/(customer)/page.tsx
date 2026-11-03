'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCatalog } from '@/components/CatalogProvider';
import { ComboBuilder } from '@/components/customer/ComboBuilder';
import { HalalBadge } from '@/components/customer/HalalBadge';
import { cleanText } from '@/components/customer/halal';
import { LastOrderCard } from '@/components/customer/LastOrderCard';
import { useQuickAdd } from '@/components/customer/useQuickAdd';
import { Heart, Logo, NotConfigured, ProductImg, toast } from '@/components/ui';
import { isBranchOpen } from '@/features/branches/assign';
import { defaultMeat, priceFrom, useBreak, useMounted, useNowMinute, variantImage } from '@/features/catalog/hooks';
import { useApp } from '@/stores/app';

const STEPS: [string, string][] = [
  ['Выберите', 'Бургеры, закуски и напитки из меню'],
  ['Мы готовим', 'Кухня собирает ваш заказ'],
  ['Доставим горячим', 'Доставка по Алматы или самовывоз'],
];

export default function HomePage() {
  const { products, branches, hours, configured } = useCatalog();
  const router = useRouter();
  const brk = useBreak();
  const now = useNowMinute();
  const mounted = useMounted();
  const quickAdd = useQuickAdd();
  const address = useApp((s) => s.address);
  const favs = useApp((s) => s.favs);
  const toggleFav = useApp((s) => s.toggleFav);
  const burgers = products.filter((p) => p.category === 'burgers');
  const champion = products.find((p) => p.slug === 'champion');
  const hero = products.find((p) => p.slug === 'double') ?? burgers[0];
  const addrShort = mounted && address ? address.label : 'Выберите адрес';

  const classic = products.find((p) => p.slug === 'classic') ?? burgers[0];
  const tiles: { id: string; label: string; img: string | null | undefined; bg: string }[] = [
    { id: 'beef', label: 'С говядиной', img: classic ? variantImage(classic, 'beef') : null, bg: '#FFF1E0' },
    { id: 'chicken', label: 'С курицей', img: champion ? variantImage(champion, 'chicken') : null, bg: '#F3EADF' },
    { id: 'sides', label: 'Фри и закуски', img: products.find((p) => p.slug === 'fries')?.image, bg: '#F3EADF' },
    { id: 'drinks', label: 'Напитки', img: products.find((p) => p.category === 'drinks' && p.image)?.image, bg: '#FFF1E0' },
  ];

  return (
    <div className="scr scr-in" style={{ flex: 1, paddingBottom: 96 }}>
      {!configured && <NotConfigured />}
      {brk && (
        <div style={{ margin: '36px 16px 0', background: '#141210', color: '#fff', borderRadius: 18, padding: '14px 16px', fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
          <b style={{ color: '#FF6A0A' }}>Технический перерыв 06:00–08:00.</b> Сейчас заказ можно только запланировать на время после 08:00.
        </div>
      )}

      <div style={{ background: '#FF6A0A', borderRadius: '0 0 36px 36px', padding: '16px 16px 0', position: 'relative', overflow: 'hidden', marginTop: brk ? 16 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo />
          <button className="btn" onClick={() => router.push('/map')} style={{ flex: 1, minWidth: 0, minHeight: 44, background: 'rgba(255,255,255,.2)', borderRadius: 14, padding: '0 12px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', color: '#fff', textAlign: 'left' }}>
            <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>Доставка по адресу</span>
            <span style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{addrShort} ▾</span>
          </button>
          <Link href="/menu?focus=1" className="btn" aria-label="Поиск" style={{ width: 44, height: 44, borderRadius: 14, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#141210" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          </Link>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap', minHeight: 28, position: 'relative', zIndex: 2 }}>
          <HalalBadge />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 12px', borderRadius: 14, background: 'rgba(20,18,16,.85)', color: '#fff', fontSize: 12, fontWeight: 800, visibility: now ? 'visible' : 'hidden' }}>
            <span className="live-dot" style={{ background: brk ? '#FFB27A' : '#4CD964' }} />
            {brk ? 'Перерыв до 08:00' : 'Открыто'}
          </span>
        </div>

        <div style={{ marginTop: 16, color: '#fff', position: 'relative', zIndex: 2, width: 230 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.12em', opacity: 0.9 }}>TOK BURGER · АЛМАТЫ</div>
          <h1 className="disp" style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.02, marginTop: 8, color: '#fff' }}>ТВОЙ ГОЛОД.<br />НАШ БУРГЕР.</h1>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 10, lineHeight: 1.35, opacity: 0.95 }}>Готовим с любовью.<br />Доставляем горячим.</div>
        </div>
        <div className="hov" style={{ position: 'absolute', right: -30, top: 112, width: 190, height: 160, animation: 'float 5s ease-in-out infinite' }}>
          {hero && <ProductImg path={variantImage(hero, 'beef')} priority />}
        </div>
        <Link href="/menu" className="btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '28px 0 -26px', position: 'relative', zIndex: 3, height: 56, padding: '0 26px', borderRadius: 28, background: '#141210', color: '#fff', fontSize: 17, fontWeight: 800, boxShadow: '0 14px 28px rgba(0,0,0,.3)', textDecoration: 'none', animation: 'ping 2.4s ease-out infinite' }}>Заказать сейчас →</Link>
        <div style={{ height: 26 }} />
      </div>

      <div style={{ marginTop: 44, padding: '0 16px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        {tiles.map((t) => (
          <Link key={t.id} href={`/menu?cat=${t.id}`} className="btn lift" style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 76, padding: '8px 8px 8px 14px', borderRadius: 24, background: '#fff', boxShadow: '0 6px 18px rgba(120,60,0,.08)', textDecoration: 'none' }}>
            <span style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 14, lineHeight: 1.2 }}>{t.label}</span>
            <span style={{ flex: 'none', width: 60, height: 60, borderRadius: 18, background: t.bg, padding: 3, boxSizing: 'border-box', overflow: 'hidden' }}><ProductImg path={t.img} /></span>
          </Link>
        ))}
      </div>

      <LastOrderCard />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '26px 16px 12px' }}>
        <h2 className="disp" style={{ fontSize: 20, fontWeight: 800 }}>Хиты</h2>
        <Link href="/menu" className="btn" style={{ color: '#C24D00', fontWeight: 800, fontSize: 14, minHeight: 44, display: 'flex', alignItems: 'center', textDecoration: 'none' }}>Всё меню</Link>
      </div>
      <div className="scr hscroll">
        {burgers.map((b) => {
          const fav = mounted && favs.includes(b.id);
          const isClassic = b.slug === 'classic';
          return (
            <div key={b.id} style={{ flex: 'none', width: 200, background: '#fff', borderRadius: 26, padding: 14, boxShadow: '0 10px 28px rgba(120,60,0,.1)', position: 'relative' }}>
              <button className="btn" aria-label={`В избранное: ${b.name}`} aria-pressed={fav} onClick={() => toast(toggleFav(b.id) ? 'Добавлено в избранное' : 'Убрано из избранного')}
                style={{ position: 'absolute', right: 10, top: 10, width: 44, height: 44, borderRadius: '50%', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Heart on={fav} />
              </button>
              <Link href={`/product/${b.slug}`} className="btn hov" aria-label={b.name} style={{ display: 'block', width: '100%', height: 120, background: isClassic ? '#FF6A0A' : '#FFF1E0', borderRadius: 20, padding: 6, boxSizing: 'border-box', overflow: 'hidden' }}>
                <ProductImg path={variantImage(b, defaultMeat(b))} fit={isClassic ? 'cover' : 'contain'} />
              </Link>
              <div className="disp" style={{ fontSize: 15, fontWeight: 800, marginTop: 10 }}>{b.name}</div>
              <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 2, minHeight: 32, lineHeight: 1.3 }}>{b.tagline}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{priceFrom(b)}</div>
                <button className="btn" aria-label={`Добавить в корзину: ${b.name}`} onClick={() => quickAdd(b)} style={{ width: 44, height: 44, borderRadius: '50%', background: '#FF6A0A', color: '#fff', fontSize: 24, fontWeight: 800, boxShadow: '0 8px 16px rgba(255,106,10,.4)' }}>+</button>
              </div>
            </div>
          );
        })}
      </div>

      {champion && (
        <div style={{ margin: '18px 16px 0', borderRadius: 28, background: '#141210', color: '#fff', padding: 20, position: 'relative', overflow: 'hidden', minHeight: 170 }}>
          <div style={{ position: 'absolute', right: -18, bottom: -22, width: 150, height: 130, opacity: 0.95, transform: 'rotate(8deg)' }}>
            <ProductImg path={champion.image} />
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', color: '#FF6A0A' }}>НОВИНКА</div>
          <div className="disp" style={{ fontSize: 24, fontWeight: 800, marginTop: 6, width: 200, lineHeight: 1.05 }}>{champion.name}</div>
          <div style={{ fontSize: 13, opacity: 0.8, marginTop: 6, width: 190, lineHeight: 1.35 }}>{cleanText(champion.description) ?? champion.tagline}</div>
          <Link href={`/product/${champion.slug}`} className="btn" style={{ display: 'inline-flex', alignItems: 'center', marginTop: 14, minHeight: 44, padding: '0 18px', borderRadius: 22, background: '#FF6A0A', color: '#fff', fontWeight: 800, fontSize: 14, textDecoration: 'none', position: 'relative' }}>
            Попробовать · {priceFrom(champion)}
          </Link>
        </div>
      )}

      <ComboBuilder />

      <section aria-label="Как мы работаем" style={{ margin: '28px 16px 0' }}>
        <h2 className="disp" style={{ fontSize: 20, fontWeight: 800 }}>Как мы работаем</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {STEPS.map(([t, d], i) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', borderRadius: 22, padding: '12px 16px' }}>
              <span className="disp" style={{ flex: 'none', width: 40, height: 40, borderRadius: 14, background: '#FFF1E0', color: '#C24D00', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{t}</div>
                <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 2 }}>{d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Филиалы" style={{ margin: '28px 16px 0' }}>
        <h2 className="disp" style={{ fontSize: 20, fontWeight: 800 }}>{branches.length || 4} филиала в Алматы</h2>
        <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 4 }}>Ежедневно 00:00–24:00 · перерыв 06:00–08:00</div>
        {branches.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {branches.map((b) => {
              const open = now ? isBranchOpen(b.id, hours, now) && b.accepts_orders : null;
              return (
                <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 14px', borderRadius: 18, background: '#fff', fontSize: 13, fontWeight: 800 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: open == null ? '#E5DACB' : open ? '#2E8B3F' : '#B3A89B' }} />
                  {b.short_name}
                </span>
              );
            })}
          </div>
        )}
        <Link href="/branches" className="btn" style={{ marginTop: 12, width: '100%', minHeight: 52, borderRadius: 18, background: '#fff', fontWeight: 800, fontSize: 15, boxShadow: '0 4px 14px rgba(120,60,0,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>Адреса и карта филиалов →</Link>
      </section>

      <footer style={{ margin: '28px 0 0', background: '#141210', color: '#fff', padding: '24px 16px', fontSize: 12, lineHeight: 1.6 }}>
        <div className="disp" style={{ fontSize: 16, fontWeight: 800, color: '#FF6A0A' }}>TOK BURGER</div>
        <div style={{ marginTop: 8 }}><HalalBadge /></div>
        <div style={{ opacity: 0.7, marginTop: 8 }}>
          {branches.map((b) => b.short_name).join(' · ') || 'Самал-3 · Радостовца · Жарокова · Толе би'}<br />
          Instagram @tokburger_official
        </div>
      </footer>
    </div>
  );
}
