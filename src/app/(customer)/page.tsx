'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCatalog } from '@/components/CatalogProvider';
import { Heart, Logo, NotConfigured, ProductImg, toast } from '@/components/ui';
import { defaultMeat, priceFrom, useBreak, useMounted, variantImage } from '@/features/catalog/hooks';
import { useApp } from '@/stores/app';
import { fmt } from '@/lib/money';

const HOME_CATS: [string, string][] = [['beef', 'С говядиной'], ['chicken', 'С курицей'], ['sides', 'Фри и закуски'], ['drinks', 'Напитки']];

export default function HomePage() {
  const { products, branches, configured } = useCatalog();
  const router = useRouter();
  const brk = useBreak();
  const mounted = useMounted();
  const address = useApp((s) => s.address);
  const favs = useApp((s) => s.favs);
  const toggleFav = useApp((s) => s.toggleFav);
  const burgers = products.filter((p) => p.category === 'burgers');
  const champion = products.find((p) => p.slug === 'champion');
  const hero = products.find((p) => p.slug === 'double');
  const addrShort = mounted && address ? address.label : 'Выберите адрес';

  return (
    <div className="scr scr-in" style={{ flex: 1, paddingBottom: 16 }}>
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
        <div style={{ marginTop: 22, color: '#fff', position: 'relative', zIndex: 2, width: 230 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.12em', opacity: 0.9 }}>TOK BURGER · АЛМАТЫ</div>
          <h1 className="disp" style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.02, marginTop: 8, color: '#fff' }}>ТВОЙ ГОЛОД.<br />НАШ БУРГЕР.</h1>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 10, lineHeight: 1.35, opacity: 0.95 }}>Готовим с любовью.<br />Доставляем горячим.</div>
        </div>
        <div className="hov" style={{ position: 'absolute', right: -30, top: 64, width: 190, height: 160, animation: 'float 5s ease-in-out infinite' }}>
          {hero && <ProductImg path={variantImage(hero, 'beef')} priority />}
        </div>
        <Link href="/menu" className="btn" style={{ display: 'inline-flex', alignItems: 'center', margin: '22px 0 -22px', position: 'relative', zIndex: 3, height: 52, padding: '0 26px', borderRadius: 26, background: '#141210', color: '#fff', fontSize: 16, fontWeight: 800, boxShadow: '0 12px 24px rgba(0,0,0,.3)', textDecoration: 'none' }}>Заказать сейчас →</Link>
        <div style={{ height: 22 }} />
      </div>

      <div className="scr" style={{ marginTop: 40, display: 'flex', gap: 10, overflowX: 'auto', padding: '0 16px' }}>
        {HOME_CATS.map(([id, label]) => (
          <Link key={id} href={`/menu?cat=${id}`} className="btn" style={{ flex: 'none', minHeight: 44, padding: '0 18px', borderRadius: 22, background: '#fff', fontWeight: 800, fontSize: 14, boxShadow: '0 4px 14px rgba(120,60,0,.08)', display: 'flex', alignItems: 'center', textDecoration: 'none' }}>{label}</Link>
        ))}
      </div>

      {champion && (
        <div style={{ margin: '20px 16px 0', borderRadius: 26, background: '#141210', color: '#fff', padding: 20, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -18, bottom: -22, width: 130, height: 110, opacity: 0.95, transform: 'rotate(8deg)' }}>
            <ProductImg path={champion.image} />
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', color: '#FF6A0A' }}>НОВИНКА</div>
          <div className="disp" style={{ fontSize: 24, fontWeight: 800, marginTop: 6, width: 200, lineHeight: 1.05 }}>{champion.name}</div>
          <div style={{ fontSize: 13, opacity: 0.8, marginTop: 6, width: 190, lineHeight: 1.35 }}>Хрустящая курица, коул-слоу и порция мёда.</div>
          <Link href={`/product/${champion.slug}`} className="btn" style={{ display: 'inline-flex', alignItems: 'center', marginTop: 14, height: 40, padding: '0 18px', borderRadius: 20, background: '#FF6A0A', color: '#fff', fontWeight: 800, fontSize: 14, textDecoration: 'none', position: 'relative' }}>
            Попробовать · {priceFrom(champion)}
          </Link>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '26px 16px 12px' }}>
        <h2 className="disp" style={{ fontSize: 20, fontWeight: 800 }}>Популярное</h2>
        <Link href="/menu" className="btn" style={{ color: '#C24D00', fontWeight: 800, fontSize: 14, minHeight: 44, display: 'flex', alignItems: 'center', textDecoration: 'none' }}>Всё меню</Link>
      </div>
      <div className="scr" style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '0 16px 8px' }}>
        {burgers.map((b) => {
          const fav = mounted && favs.includes(b.id);
          const isClassic = b.slug === 'classic';
          return (
            <div key={b.id} style={{ flex: 'none', width: 200, background: '#fff', borderRadius: 26, padding: 14, boxShadow: '0 10px 28px rgba(120,60,0,.1)', position: 'relative' }}>
              <button className="btn" aria-label="В избранное" aria-pressed={fav} onClick={() => toast(toggleFav(b.id) ? 'Добавлено в избранное' : 'Убрано из избранного')}
                style={{ position: 'absolute', right: 10, top: 10, width: 44, height: 44, borderRadius: '50%', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Heart on={fav} />
              </button>
              <Link href={`/product/${b.slug}`} className="btn hov" aria-label={b.name} style={{ display: 'block', width: '100%', height: 120, background: isClassic ? '#FF6A0A' : '#FFF1E0', borderRadius: 20, padding: 6, boxSizing: 'border-box', overflow: 'hidden' }}>
                <ProductImg path={variantImage(b, defaultMeat(b))} fit={isClassic ? 'cover' : 'contain'} />
              </Link>
              <div className="disp" style={{ fontSize: 15, fontWeight: 800, marginTop: 10 }}>{b.name}</div>
              <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 2 }}>{b.tagline}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{priceFrom(b)}</div>
                <Link href={`/product/${b.slug}`} className="btn" aria-label={`Выбрать ${b.name}`} style={{ width: 44, height: 44, borderRadius: '50%', background: '#FF6A0A', color: '#fff', fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>+</Link>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ margin: '18px 16px 0', borderRadius: 26, background: '#FF6A0A', color: '#fff', padding: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em' }}>РЕКОМЕНДУЕМ</div>
        <div className="disp" style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>Бургер + фри + наггетсы</div>
        <div style={{ fontSize: 13, marginTop: 6, opacity: 0.95 }}>
          Добавляйте закуски прямо на странице бургера: картофель фри {fmt(695)}, наггетсы {fmt(795)}.
        </div>
      </div>

      <div style={{ margin: '24px 16px 0' }}>
        <h2 className="disp" style={{ fontSize: 20, fontWeight: 800 }}>{branches.length || 4} филиала в Алматы</h2>
        <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 4 }}>Ежедневно 00:00–24:00 · перерыв 06:00–08:00</div>
        <Link href="/branches" className="btn" style={{ marginTop: 12, width: '100%', minHeight: 52, borderRadius: 18, background: '#fff', fontWeight: 800, fontSize: 15, boxShadow: '0 4px 14px rgba(120,60,0,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>Адреса и карта филиалов →</Link>
      </div>

      <footer style={{ margin: '28px 0 0', background: '#141210', color: '#fff', padding: '24px 16px', fontSize: 12, lineHeight: 1.6 }}>
        <div className="disp" style={{ fontSize: 16, fontWeight: 800, color: '#FF6A0A' }}>TOK BURGER</div>
        <div style={{ opacity: 0.7, marginTop: 6 }}>
          {branches.map((b) => b.short_name).join(' · ') || 'Самал-3 · Радостовца · Жарокова · Толе би'}<br />
          Instagram @tokburger_official
        </div>
      </footer>
    </div>
  );
}
