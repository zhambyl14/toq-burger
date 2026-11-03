'use client';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import Map from '@/components/maps/Map';
import { useCatalog } from '@/components/CatalogProvider';
import { BackBtn, toast } from '@/components/ui';
import { isBranchOpen } from '@/features/branches/assign';
import { useQuote } from '@/features/branches/useQuote';
import { useNowMinute } from '@/features/catalog/hooks';
import { useApp } from '@/stores/app';

export default function BranchesPage() {
  const router = useRouter();
  const { branches, hours } = useCatalog();
  const setApp = useApp((s) => s.set);
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
      <div style={{ marginTop: 14, height: 300, borderRadius: 26, overflow: 'hidden' }}>
        <Map branches={markers} height="100%" zoom={12} />
      </div>
      <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: '#4A423A' }}>
        Пн–Вс 00:00–24:00 · перерыв 06:00–08:00 · сейчас: <b style={{ color: anyOpen ? '#2E8B3F' : '#B3261E' }}>{anyOpen ? 'открыто' : 'перерыв до 08:00'}</b>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        {branches.map((b) => {
          const open = now ? isBranchOpen(b.id, hours, now) && b.accepts_orders : true;
          const on = b.id === chosenId;
          return (
            <div key={b.id} style={{ background: '#fff', borderRadius: 22, padding: 16, border: `2px solid ${on ? '#FF6A0A' : 'transparent'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div className="disp" style={{ fontSize: 15, fontWeight: 800 }}>{b.name}</div>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: open ? '#2E8B3F' : '#B3261E', borderRadius: 10, padding: '4px 8px', height: 'fit-content', whiteSpace: 'nowrap' }}>{open ? 'ОТКРЫТО' : b.accepts_orders ? 'ПЕРЕРЫВ' : 'НЕ ПРИНИМАЕТ'}</span>
              </div>
              <div style={{ fontSize: 13, color: '#4A423A', fontWeight: 600, marginTop: 6, lineHeight: 1.4 }}>{b.address}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn primary" onClick={() => { setApp({ pickupBranchId: b.id, mode: 'PICKUP' }); toast('Выбран: ' + b.short_name + ' (самовывоз)'); }}
                  style={{ flex: 1, minHeight: 44, borderRadius: 14, fontSize: 13, boxShadow: 'none' }}>Самовывоз отсюда</button>
                {b.map_url && (
                  <a href={b.map_url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minHeight: 44, borderRadius: 14, background: '#F3EADF', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: '#141210' }}>2GIS ↗</a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
