'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import Map from '@/components/maps/Map';
import { useCatalog } from '@/components/CatalogProvider';
import { BackBtn, PinIcon, toast } from '@/components/ui';
import { isBranchOpen } from '@/features/branches/assign';
import { useQuote } from '@/features/branches/useQuote';
import { useMounted, useNowMinute } from '@/features/catalog/hooks';
import { useApp } from '@/stores/app';
import { fmt } from '@/lib/money';

function Chip({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return <span style={{ fontSize: 11, fontWeight: 800, color, background: bg, borderRadius: 10, padding: '5px 9px', height: 'fit-content', whiteSpace: 'nowrap' }}>{children}</span>;
}

export default function BranchesPage() {
  const router = useRouter();
  const { branches, hours } = useCatalog();
  const mounted = useMounted();
  const setApp = useApp((s) => s.set);
  const mode = useApp((s) => s.mode);
  const pickupId = useApp((s) => s.pickupBranchId);
  const quote = useQuote();
  const now = useNowMinute();
  const chosenId = quote.branch?.id;
  const markers = useMemo(() => branches.filter((b) => b.lat != null && b.lon != null)
    .map((b) => ({ id: b.id, lat: b.lat!, lon: b.lon!, label: b.short_name, active: b.id === chosenId })), [branches, chosenId]);
  const anyOpen = now ? branches.some((b) => isBranchOpen(b.id, hours, now)) : true;

  return (
    <div className="scr-in" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <BackBtn onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))} />
        <h1 className="disp" style={{ fontSize: 22, fontWeight: 800 }}>Филиалы</h1>
      </div>
      <div style={{ marginTop: 14, height: 300, borderRadius: 28, overflow: 'hidden', boxShadow: '0 10px 28px rgba(120,60,0,.12)' }}>
        {mounted ? <Map branches={markers} height="100%" zoom={12} /> : <div aria-label="Загрузка карты" style={{ height: '100%', background: '#F3EADF', animation: 'fade .9s ease-in-out infinite alternate' }} />}
      </div>
      <div style={{ marginTop: 12, background: '#fff', borderRadius: 20, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: '#4A423A' }}>
        <span aria-hidden="true" style={{ flex: 'none', width: 10, height: 10, borderRadius: '50%', background: anyOpen ? '#2E8B3F' : '#B3261E', animation: anyOpen ? 'ping 1.6s infinite' : 'none' }} />
        <span style={{ flex: 1 }}>Ежедневно 00:00–24:00, перерыв 06:00–08:00. Сейчас: <b style={{ color: anyOpen ? '#2E8B3F' : '#B3261E' }}>{anyOpen ? 'открыто' : 'перерыв до 08:00'}</b></span>
      </div>

      {branches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <PinIcon size={36} />
          <div className="disp" style={{ fontSize: 18, fontWeight: 800, marginTop: 12 }}>Филиалы скоро появятся</div>
          <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 6 }}>Список филиалов пока не загружен. Попробуйте обновить страницу.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          {branches.map((b) => {
            const open = now ? isBranchOpen(b.id, hours, now) && b.accepts_orders : true;
            const on = b.id === chosenId;
            const picked = mounted && mode === 'PICKUP' && pickupId === b.id;
            return (
              <article key={b.id} style={{ background: '#fff', borderRadius: 26, padding: 16, border: `2px solid ${on ? '#FF6A0A' : 'transparent'}`, boxShadow: '0 8px 22px rgba(120,60,0,.07)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <h2 className="disp" style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{b.name}</h2>
                  {open
                    ? <Chip bg="#E6F4E8" color="#1F6B2D">ОТКРЫТО</Chip>
                    : b.accepts_orders ? <Chip bg="#FFF1E0" color="#C24D00">ПЕРЕРЫВ</Chip> : <Chip bg="#FBE5E3" color="#B3261E">НЕ ПРИНИМАЕТ</Chip>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {on && <Chip bg="#FF6A0A" color="#fff">ГОТОВИТ ВАШ ЗАКАЗ</Chip>}
                  {picked && <Chip bg="#141210" color="#fff">САМОВЫВОЗ ВЫБРАН</Chip>}
                </div>
                <div style={{ fontSize: 13, color: '#4A423A', fontWeight: 600, marginTop: 8, lineHeight: 1.4 }}>{b.address}</div>
                <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12, fontWeight: 700, color: '#6B6258', flexWrap: 'wrap' }}>
                  <span>Доставка {fmt(b.delivery_fee_kzt)}</span>
                  {b.min_order_kzt > 0 && <span>Минимальный заказ {fmt(b.min_order_kzt)}</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn primary" onClick={() => { setApp({ pickupBranchId: b.id, mode: 'PICKUP' }); toast('Выбран: ' + b.short_name + ' (самовывоз)'); }}
                    style={{ flex: 1, minHeight: 48, borderRadius: 16, fontSize: 13, boxShadow: 'none' }}>{picked ? 'Выбрано ✓' : 'Самовывоз отсюда'}</button>
                  {b.map_url && (
                    <a href={b.map_url} target="_blank" rel="noopener noreferrer" aria-label={`Маршрут до филиала ${b.short_name} в 2GIS`} className="btn" style={{ flex: 1, minHeight: 48, borderRadius: 16, background: '#F3EADF', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: '#141210' }}>Маршрут · 2GIS ↗</a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <Link href="/menu" className="btn dark" style={{ marginTop: 16, width: '100%', height: 56, borderRadius: 28, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>Перейти к меню</Link>
    </div>
  );
}
