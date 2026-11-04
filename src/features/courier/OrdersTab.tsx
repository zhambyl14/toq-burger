'use client';
import { useMemo } from 'react';
import RouteMap from '@/components/maps/Map';
import { Spinner } from '@/components/ui';
import { useOrderNames } from '@/features/kitchen/names';
import { useLang } from '@/i18n/LangProvider';
import { fmt } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import type { OrderRow, OrderStatus } from '@/types/catalog';
import {
  DELIVERING, PRE_PICKUP, addrText, branchPoint, dropPoint, gisUrl, isReadyToPick, itemsText, orderStops, payLabel, yandexUrl, type Point,
} from './helpers';
import type { CBranch } from './useCourier';

const CSS = `
@keyframes c-pulse { 0% { box-shadow: 0 0 0 0 rgba(46,139,63,.7) } 100% { box-shadow: 0 0 0 14px rgba(46,139,63,0) } }
@keyframes c-radar { 0% { transform: scale(.35); opacity: .85 } 100% { transform: scale(1.7); opacity: 0 } }
.c-pulse { animation: c-pulse 1.4s ease-out infinite }
.c-radar i { position: absolute; inset: 0; border-radius: 50%; border: 2px solid #FF6A0A; animation: c-radar 2.6s ease-out infinite }
.c-radar i:nth-child(2) { animation-delay: .85s }
.c-radar i:nth-child(3) { animation-delay: 1.7s }
@media (prefers-reduced-motion: reduce) { .c-pulse, .c-radar i { animation: none !important } }
`;

const MUTED = '#B9AFA3';
const linkBtn: React.CSSProperties = {
  flex: 1, minHeight: 48, borderRadius: 24, background: '#3A332D', fontWeight: 800, fontSize: 14, color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none',
};

function NavLinks({ to, phone }: { to: Point | null; phone?: string }) {
  const { t } = useLang();
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      {to && (
        <>
          <a href={gisUrl(to)} target="_blank" rel="noopener noreferrer" className="btn" style={linkBtn} aria-label={t('Открыть маршрут в 2GIS', '2GIS-те маршрутты ашу')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="m3 11 18-8-8 18-2-8z" /></svg>2GIS
          </a>
          <a href={yandexUrl(to)} target="_blank" rel="noopener noreferrer" className="btn" style={linkBtn} aria-label={t('Открыть маршрут в Яндекс Картах', 'Яндекс Карталарда маршрутты ашу')}>Яндекс</a>
        </>
      )}
      {phone && (
        <a href={`tel:${phone}`} className="btn" style={linkBtn} aria-label={t('Позвонить клиенту', 'Клиентке қоңырау шалу')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>{t('Позвонить', 'Қоңырау шалу')}
        </a>
      )}
    </div>
  );
}

function Chip({ status }: { status: OrderStatus }) {
  const { t } = useLang();
  const ready = isReadyToPick(status);
  return (
    <span className={ready ? 'c-pulse' : undefined}
      style={{ display: 'inline-block', borderRadius: 14, padding: '5px 11px', fontSize: 12, fontWeight: 800, background: ready ? '#2E8B3F' : 'rgba(255,106,10,.18)', color: ready ? '#fff' : '#FF8A3D' }}>
      {ready ? t('Готов — забирайте', 'Дайын — алып кетіңіз') : t('Готовится — ехать в филиал', 'Дайындалуда — филиалға жүріңіз')}
    </span>
  );
}

interface Props {
  orders: OrderRow[] | null;
  branches: CBranch[];
  online: boolean;
  accountActive: boolean;
  busy: string | null;
  gpsPos: Point | null;
  onStep: (o: OrderRow, to: OrderStatus) => void;
  onGoOnline: () => void;
}

export function OrdersTab({ orders, branches, online, accountActive, busy, gpsPos, onStep, onGoOnline }: Props) {
  const { t, lang } = useLang();
  const names = useOrderNames();
  const list = useMemo(() => orders ?? [], [orders]);
  const branchOf = (id: string) => branches.find((b) => b.id === id);

  const groups = useMemo(() => {
    const ids: string[] = [];
    const by: Record<string, OrderRow[]> = {};
    list.filter((o) => PRE_PICKUP.includes(o.status)).forEach((o) => {
      if (!by[o.branch_id]) { by[o.branch_id] = []; ids.push(o.branch_id); }
      by[o.branch_id].push(o);
    });
    return ids.map((id) => ({ id, orders: by[id] }));
  }, [list]);

  const stops = useMemo(() => {
    const d = list.filter((o) => DELIVERING.includes(o.status)).sort((a, b) => (a.picked_up_at ?? '').localeCompare(b.picked_up_at ?? ''));
    if (!d.length) return [];
    const b = branches.find((x) => x.id === d[0].branch_id);
    return orderStops(d, branchPoint(b));
  }, [list, branches]);

  const next = stops[0];
  const nextBranch = next ? branches.find((x) => x.id === next.branch_id) : undefined;
  const nextDrop = useMemo(() => (next ? dropPoint(next) : null), [next]);
  const nextBp = useMemo(() => branchPoint(nextBranch), [nextBranch]);
  const markers = useMemo(() => (nextBranch && nextBp ? [{ id: nextBranch.id, lat: nextBp.lat, lon: nextBp.lon, label: nextBranch.short_name }] : []), [nextBranch, nextBp]);
  const route = useMemo(() => (nextBp && nextDrop ? ([nextBp, nextDrop] as [Point, Point]) : null), [nextBp, nextDrop]);

  if (orders === null) return <div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>;

  if (!list.length) {
    return (
      <div style={{ background: '#241F1B', borderRadius: 24, padding: '32px 20px', textAlign: 'center', marginTop: 8 }}>
        <style>{CSS}</style>
        {online ? (
          <>
            <div className="c-radar" aria-hidden="true" style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i /><i /><i />
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#FF6A0A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="17" r="3.2" /><circle cx="18" cy="17" r="3.2" /><path d="M6 17l4-8h5l3 8M9 9H7M13 9l-2 8" /></svg>
            </div>
            <div className="disp" style={{ fontSize: 20, fontWeight: 800 }}>{t('Ждём заказ — вы на линии', 'Тапсырысты күтеміз — сіз желідесіз')}</div>
            <p style={{ color: MUTED, fontSize: 13, fontWeight: 700, lineHeight: 1.5, margin: '10px 0 0' }}>
              {t('Заказ назначится автоматически, как только кухня начнёт его готовить. Звук и уведомление сработают сами — оставьте приложение открытым.', 'Асхана дайындай бастағанда тапсырыс автоматты түрде тағайындалады. Дыбыс пен хабарландыру өздігінен істейді — қосымшаны ашық қалдырыңыз.')}
            </p>
          </>
        ) : (
          <>
            <div className="disp" style={{ fontSize: 20, fontWeight: 800 }}>{t('Вы не на линии', 'Сіз желіде емессіз')}</div>
            <p style={{ color: MUTED, fontSize: 13, fontWeight: 700, lineHeight: 1.5, margin: '10px 0 16px' }}>
              {t('Заказы назначаются автоматически только курьерам на линии. Выйдите на линию, разрешите геолокацию — и система сама подберёт вам заказ.', 'Тапсырыстар тек желідегі курьерлерге автоматты түрде тағайындалады. Желіге шығыңыз, геолокацияға рұқсат беріңіз — жүйе өзі сізге тапсырыс таңдайды.')}
            </p>
            <button className="btn" onClick={onGoOnline} disabled={!accountActive}
              style={{ minHeight: 52, padding: '0 28px', borderRadius: 26, background: '#FF6A0A', color: '#fff', fontWeight: 800, fontSize: 15 }}>{t('Выйти на линию', 'Желіге шығу')}</button>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{CSS}</style>

      {groups.map((g) => {
        const b = branchOf(g.id);
        return (
          <section key={g.id} aria-label={`${t('Филиал', 'Филиал')} ${b?.name ?? ''}`} style={{ background: '#241F1B', borderRadius: 24, padding: 16, borderLeft: '5px solid #FF6A0A' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#FF6A0A', letterSpacing: '.08em' }}>{t('МАРШРУТ', 'МАРШРУТ')}</div>
            <h2 className="disp" style={{ fontSize: 18, fontWeight: 800, margin: '4px 0 2px' }}>{t('Едем в филиал', 'Филиалға барамыз')} {b?.name ?? '—'}</h2>
            <div style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>{b?.address ?? ''}</div>
            <NavLinks to={branchPoint(b)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
              {g.orders.map((o) => {
                const ready = isReadyToPick(o.status);
                return (
                  <article key={o.id} style={{ background: '#1C1815', borderRadius: 20, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>#TB-{o.order_no}</div>
                      <Chip status={o.status} />
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: MUTED, lineHeight: 1.5 }}>{itemsText(o, names.item, lang) || '—'}</div>
                    <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: MUTED }}>{payLabel(o.payment_method, lang)} · {fmt(o.total_kzt)}</div>
                    <button className="btn" disabled={!ready || busy === o.id} onClick={() => onStep(o, 'PICKED_UP')}
                      aria-describedby={ready ? undefined : `wait-${o.id}`}
                      style={{ marginTop: 12, width: '100%', height: 54, borderRadius: 27, background: ready ? '#2E8B3F' : '#3A332D', color: ready ? '#fff' : '#8A7F73', fontWeight: 800, fontSize: 16 }}>
                      {busy === o.id ? <span className="spinner" /> : t('Забрал заказ', 'Тапсырысты алдым')}
                    </button>
                    {!ready && <div id={`wait-${o.id}`} style={{ marginTop: 6, textAlign: 'center', fontSize: 12, fontWeight: 700, color: MUTED }}>{t('Ждём готовности', 'Дайын болуын күтеміз')}</div>}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      {stops.length > 0 && (
        <section aria-label={t('Доставка клиентам', 'Клиенттерге жеткізу')} style={{ background: '#241F1B', borderRadius: 24, padding: 16, borderLeft: '5px solid #7B3FE4' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#B58CFF', letterSpacing: '.08em' }}>{t('ДОСТАВКА', 'ЖЕТКІЗУ')}</div>
          <h2 className="disp" style={{ fontSize: 18, fontWeight: 800, margin: '4px 0 2px' }}>
            {stops.length === 1 ? t('Везём клиенту', 'Клиентке апарамыз') : `${t('Остановок', 'Аялдама')}: ${stops.length}`}
          </h2>
          {stops.length > 1 && <div style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>{t('Порядок — по ближайшей точке от филиала.', 'Реті — филиалдан ең жақын нүкте бойынша.')}</div>}
          {route && (
            <div style={{ marginTop: 12, height: 220, borderRadius: 20, overflow: 'hidden', background: '#EFE6D8' }}>
              <RouteMap branches={markers} pin={nextDrop} courier={gpsPos} route={route} height="100%" center={gpsPos ?? nextDrop ?? undefined} zoom={13} />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            {stops.map((o, i) => {
              const a = addrText(o, lang);
              const onWay = o.status === 'ON_THE_WAY';
              return (
                <article key={o.id} style={{ background: '#1C1815', borderRadius: 20, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span aria-label={`${t('Остановка', 'Аялдама')} ${i + 1}`} style={{ flex: 'none', width: 32, height: 32, borderRadius: '50%', background: i === 0 ? '#FF6A0A' : '#3A332D', color: '#fff', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 16 }}>#TB-{o.order_no}</div>
                    <span style={{ borderRadius: 14, padding: '5px 11px', fontSize: 12, fontWeight: 800, background: 'rgba(123,63,228,.25)', color: '#C9A8FF' }}>{onWay ? t('В пути', 'Жолда') : t('Заказ у вас', 'Тапсырыс сізде')}</span>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700, lineHeight: 1.55 }}>
                    <div><span style={{ color: MUTED }}>{t('Адрес', 'Мекенжай')}:</span> {a || '—'}</div>
                    {o.courier_instructions && <div><span style={{ color: MUTED }}>{t('Комментарий', 'Түсініктеме')}:</span> {o.courier_instructions}</div>}
                    <div><span style={{ color: MUTED }}>{t('Клиент', 'Клиент')}:</span> {o.customer_name ? o.customer_name + ' · ' : ''}{formatPhone(o.contact_phone)}</div>
                    <div><span style={{ color: MUTED }}>{t('Оплата', 'Төлем')}:</span> {payLabel(o.payment_method, lang)} · {fmt(o.total_kzt)}</div>
                    <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>{itemsText(o, names.item, lang)}</div>
                  </div>
                  <NavLinks to={dropPoint(o)} phone={o.contact_phone} />
                  <button className="btn" disabled={busy === o.id} onClick={() => onStep(o, onWay ? 'DELIVERED' : 'ON_THE_WAY')}
                    style={{ marginTop: 12, width: '100%', height: 56, borderRadius: 28, background: '#FF6A0A', color: '#fff', fontWeight: 800, fontSize: 17, boxShadow: '0 10px 24px rgba(255,106,10,.35)' }}>
                    {busy === o.id ? <span className="spinner" /> : onWay ? t('Доставлено', 'Жеткізілді') : t('Выехал', 'Жолға шықтым')}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
