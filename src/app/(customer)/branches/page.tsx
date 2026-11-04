'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import Map from '@/components/maps/Map';
import { useCatalog } from '@/components/CatalogProvider';
import { PinIcon, toast } from '@/components/ui';
import { BoltMark } from '@/components/customer/BoltMark';
import { PricePill } from '@/components/customer/PricePill';
import { isBranchOpen } from '@/features/branches/assign';
import { useQuote } from '@/features/branches/useQuote';
import { useMounted, useNowMinute } from '@/features/catalog/hooks';
import { useLang } from '@/i18n/LangProvider';
import { useApp } from '@/stores/app';
import { fmt } from '@/lib/money';
import '@/styles/flow.css';

function Chip({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return <span className="fl-chip" style={{ color, background: bg }}>{children}</span>;
}

export default function BranchesPage() {
  const router = useRouter();
  const { t } = useLang();
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
    <div className="scr-in fl-page">
      <div className="fl-head">
        <button className="btn fl-back" onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))} aria-label={t('Назад', 'Артқа')}>←</button>
        <h1 className="disp fl-title">{t('Филиалы', 'Филиалдар')}</h1>
        <BoltMark size={34} rotate={-8} />
      </div>

      <div className="fl-br">
        <div className="fl-br__map">
          <div className="fl-br__mapbox">
            {mounted ? <Map branches={markers} height="100%" zoom={12} /> : <div aria-label={t('Загрузка карты', 'Карта жүктелуде')} style={{ height: '100%', background: '#F3EADF', animation: 'fade .9s ease-in-out infinite alternate' }} />}
          </div>
          <div className="fl-br__hours">
            <span aria-hidden="true" style={{ flex: 'none', width: 10, height: 10, borderRadius: '50%', background: anyOpen ? '#2E8B3F' : '#B3261E', animation: anyOpen ? 'ping 1.6s infinite' : 'none' }} />
            <span style={{ flex: 1 }}>{t('Ежедневно 00:00–24:00, перерыв 06:00–08:00. Сейчас: ', 'Күн сайын 00:00–24:00, үзіліс 06:00–08:00. Қазір: ')}<b style={{ color: anyOpen ? '#2E8B3F' : '#B3261E' }}>{anyOpen ? t('открыто', 'ашық') : t('перерыв до 08:00', '08:00-ге дейін үзіліс')}</b></span>
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          {branches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <PinIcon size={36} />
              <div className="disp" style={{ fontSize: 18, fontWeight: 800, marginTop: 12 }}>{t('Филиалы скоро появятся', 'Филиалдар жақында ашылады')}</div>
              <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 6 }}>{t('Список филиалов пока не загружен. Попробуйте обновить страницу.', 'Филиалдар тізімі әлі жүктелмеді. Бетті жаңартып көріңіз.')}</div>
            </div>
          ) : (
            <div className="fl-br__list">
              {branches.map((b) => {
                const open = now ? isBranchOpen(b.id, hours, now) && b.accepts_orders : true;
                const on = b.id === chosenId;
                const picked = mounted && mode === 'PICKUP' && pickupId === b.id;
                return (
                  <article key={b.id} className="fl-br__card" style={{ border: `${on ? 3 : 2}px solid ${on ? '#F96000' : '#FFE3CC'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <h2 className="disp" style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{b.name}</h2>
                      {open
                        ? <Chip bg="#E6F4E8" color="#1F6B2D">{t('ОТКРЫТО', 'АШЫҚ')}</Chip>
                        : b.accepts_orders ? <Chip bg="#FFF1E0" color="#C24D00">{t('ПЕРЕРЫВ', 'ҮЗІЛІС')}</Chip> : <Chip bg="#FBE5E3" color="#B3261E">{t('НЕ ПРИНИМАЕТ', 'ҚАБЫЛДАМАЙДЫ')}</Chip>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      {on && <Chip bg="#FF6A0A" color="#fff">{t('ГОТОВИТ ВАШ ЗАКАЗ', 'ТАПСЫРЫСЫҢЫЗДЫ ДАЙЫНДАЙДЫ')}</Chip>}
                      {picked && <Chip bg="#141210" color="#fff">{t('САМОВЫВОЗ ВЫБРАН', 'ӨЗІ АЛЫП КЕТУ ТАҢДАЛДЫ')}</Chip>}
                    </div>
                    <div style={{ fontSize: 13, color: '#4A423A', fontWeight: 600, marginTop: 8, lineHeight: 1.4 }}>{b.address}</div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <PricePill kk="жеткізу" ru="доставка" price={b.delivery_fee_kzt} />
                      {b.min_order_kzt > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#6B6258' }}>{t('Минимальный заказ', 'Ең аз тапсырыс')} {fmt(b.min_order_kzt)}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      <button className="btn primary" onClick={() => { setApp({ pickupBranchId: b.id, mode: 'PICKUP' }); toast(t('Выбран: ', 'Таңдалды: ') + b.short_name + t(' (самовывоз)', ' (өзі алып кету)')); }}
                        style={{ flex: '1 1 150px', minHeight: 48, borderRadius: 16, fontSize: 13, boxShadow: 'none' }}>{picked ? t('Выбрано ✓', 'Таңдалды ✓') : t('Самовывоз отсюда', 'Осы жерден өзі алып кету')}</button>
                      {b.map_url && (
                        <a href={b.map_url} target="_blank" rel="noopener noreferrer" aria-label={`${t('Маршрут до филиала', 'Филиалға маршрут')} ${b.short_name} · 2GIS`} className="btn" style={{ flex: '1 1 150px', minHeight: 48, borderRadius: 16, background: '#F3EADF', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: '#141210' }}>{t('Маршрут', 'Маршрут')} · 2GIS ↗</a>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <Link href="/menu" className="btn dark" style={{ marginTop: 16, width: '100%', height: 56, borderRadius: 28, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>{t('Перейти к меню', 'Мәзірге өту')}</Link>
        </div>
      </div>
    </div>
  );
}
