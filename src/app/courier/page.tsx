'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Map from '@/components/maps/Map';
import { Logo, Spinner, toast } from '@/components/ui';
import { StaffGuard } from '@/components/staff/StaffGuard';
import { meatName, useNowMinute } from '@/features/catalog/hooks';
import { useCourierData, useCourierGps, type CBranch } from '@/features/courier/useCourier';
import { startOfAlmatyDay } from '@/features/kitchen/useKitchen';
import { dateShort, orderErr, timeHM } from '@/features/orders/status';
import { signOut, useSession } from '@/hooks/useSession';
import { fmt } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { sb } from '@/lib/supabase/client';
import type { OrderRow, OrderStatus } from '@/types/catalog';

type Tab = 'offers' | 'active' | 'earn' | 'profile';

const PAY: Record<OrderRow['payment_method'], string> = { CASH: 'Оплата при получении', KASPI_QR: 'Kaspi QR', ONLINE: 'Онлайн' };
const STEP: Partial<Record<OrderStatus, { label: string; btn: string; to: OrderStatus }>> = {
  COURIER_ASSIGNED: { label: 'Едете в филиал', btn: 'Я на месте · забрал заказ', to: 'PICKED_UP' },
  PICKED_UP: { label: 'Заказ у вас — начните доставку', btn: 'Начать доставку', to: 'ON_THE_WAY' },
  ON_THE_WAY: { label: 'Курьер в пути к клиенту', btn: 'Доставлено', to: 'DELIVERED' },
};

const items = (o: OrderRow) => (o.order_items ?? []).map((i) => `${i.product_name}${i.meat !== 'one' ? ' (' + meatName(i.meat).toLowerCase() + ')' : ''}${i.quantity > 1 ? ' ×' + i.quantity : ''}`).join(' + ');
const addr = (o: OrderRow) => [o.address_text, o.apartment && `кв. ${o.apartment}`, o.entrance && `подъезд ${o.entrance}`, o.floor && `этаж ${o.floor}`, o.intercom && `домофон ${o.intercom}`].filter(Boolean).join(', ');

const ICONS: Record<Tab, React.ReactNode> = {
  offers: <><circle cx="6" cy="17" r="3.2" /><circle cx="18" cy="17" r="3.2" /><path d="M6 17l4-8h5l3 8M9 9H7M13 9l-2 8" /></>,
  active: <><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></>,
  earn: <><circle cx="12" cy="12" r="9" /><path d="M9 8h6M12 8v8M9 12h6" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
};

function Courier() {
  const session = useSession();
  const router = useRouter();
  const nowMin = useNowMinute();
  const uid = session.user?.id;
  const { me, setMe, offers, active, history, branches, reload } = useCourierData(uid);
  const [tab, setTab] = useState<Tab>('offers');
  const [busy, setBusy] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const gps = useCourierGps(!!active);

  const online = !!me?.is_online;
  const branchOf = (id: string): CBranch | undefined => branches.find((b) => b.id === id);
  const activeBranch = active ? branchOf(active.branch_id) : undefined;

  const toggleOnline = async () => {
    if (!uid || !me) return;
    const v = !online;
    const { error } = await sb().from('couriers').update({ is_online: v }).eq('user_id', uid);
    if (error) return toast('Не удалось изменить статус');
    setMe({ ...me, is_online: v });
    toast(v ? 'Вы на линии' : 'Вы ушли с линии');
  };

  const accept = async (o: OrderRow) => {
    if (active) { toast('Сначала завершите текущую доставку'); return; }
    setBusy(o.id);
    const { data, error } = await sb().rpc('courier_accept_order', { p_order: o.id });
    setBusy(null);
    if (error) { toast(orderErr(error.message)); return; }
    if (data === false) { toast('Заказ уже забрал другой курьер'); reload(); return; }
    toast(`Заказ #TB-${o.order_no} ваш`);
    await reload();
    setTab('active');
  };
  const skip = async (o: OrderRow) => {
    setSkipped((s) => [...s, o.id]);
    const { error } = await sb().rpc('courier_reject_order', { p_order: o.id });
    if (error) toast('Не удалось пропустить заказ');
    reload();
  };
  const nextStep = async () => {
    if (!active) return;
    const st = STEP[active.status];
    if (!st) return;
    if (st.to === 'DELIVERED' && !confirm('Подтвердите: заказ передан клиенту?')) return;
    setBusy(active.id);
    const { error } = await sb().rpc('transition_order', { p_order: active.id, p_to: st.to, p_note: null });
    setBusy(null);
    if (error) { toast(orderErr(error.message)); reload(); return; }
    toast(st.to === 'DELIVERED' ? 'Заказ доставлен' : 'Статус обновлён');
    await reload();
    if (st.to === 'DELIVERED') setTab('earn');
  };

  const aLat = active?.lat ?? null, aLon = active?.lon ?? null;
  const dest = useMemo(() => (aLat != null && aLon != null ? { lat: aLat, lon: aLon } : null), [aLat, aLon]);
  const markers = useMemo(() => (activeBranch?.lat != null && activeBranch.lon != null ? [{ id: activeBranch.id, lat: activeBranch.lat, lon: activeBranch.lon, label: activeBranch.short_name }] : []), [activeBranch]);
  const route = useMemo(() => (markers[0] && dest ? [{ lat: markers[0].lat, lon: markers[0].lon }, dest] as [{ lat: number; lon: number }, { lat: number; lon: number }] : null), [markers, dest]);

  // navigation target: branch before pickup, customer after
  const navTarget = active?.status === 'COURIER_ASSIGNED' && activeBranch?.lat != null ? { lat: activeBranch.lat, lon: activeBranch.lon! } : dest;

  const todayStart = nowMin ? startOfAlmatyDay(nowMin) : '';
  const weekStart = nowMin ? new Date(nowMin.getTime() - 7 * 86400_000).toISOString() : '';
  const doneToday = history.filter((h) => (h.delivered_at ?? '') >= todayStart).length;
  const doneWeek = history.filter((h) => (h.delivered_at ?? '') >= weekStart).length;
  const visibleOffers = (offers ?? []).filter((o) => !skipped.includes(o.id));

  const card = { background: '#241F1B', borderRadius: 22, padding: 28, textAlign: 'center' as const, fontWeight: 700, color: '#B9AFA3' };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100dvh', background: '#141210', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <header style={{ flex: 'none', padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Logo size={44} radius={14} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#FF6A0A', letterSpacing: '.1em' }}>КУРЬЕР</div>
          <div style={{ fontWeight: 800, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me?.display_name ?? 'Курьер'}</div>
        </div>
        <button className="btn" onClick={toggleOnline} disabled={!me} aria-pressed={online}
          style={{ minHeight: 44, padding: '0 16px', borderRadius: 22, background: online ? '#2E8B3F' : '#3A332D', color: '#fff', fontWeight: 800, fontSize: 13 }}>{online ? 'На линии' : 'Не на линии'}</button>
      </header>

      <main style={{ flex: 1, overflowY: 'auto', padding: '0 16px 100px' }}>
        {me && !me.is_active && <div style={{ ...card, marginBottom: 12, color: '#FF6A0A' }}>Аккаунт курьера отключён администратором.</div>}

        {tab === 'offers' && (
          <section style={{ animation: 'up .3s ease both' }}>
            <h1 className="disp" style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 12px' }}>Доступные заказы</h1>
            {offers === null ? <div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>
              : !online ? <div style={card}>Вы не на линии. Включите, чтобы получать предложения.</div>
                : !visibleOffers.length ? <div style={card}>Новых предложений нет. Когда кухня отметит заказ готовым, он появится здесь.</div>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {visibleOffers.map((o) => {
                        const b = branchOf(o.branch_id);
                        return (
                          <div key={o.id} style={{ background: '#fff', color: '#141210', borderRadius: 24, padding: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ fontWeight: 800, fontSize: 16 }}>#TB-{o.order_no}</div>
                              <div style={{ fontWeight: 800, color: '#C24D00', fontSize: 13 }}>{PAY[o.payment_method]} · {fmt(o.total_kzt)}</div>
                            </div>
                            <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, lineHeight: 1.5 }}>
                              <span style={{ color: '#6B6258' }}>Забрать:</span> {b ? `${b.name}, ${b.address}` : '—'}<br />
                              <span style={{ color: '#6B6258' }}>Доставить:</span> {addr(o) || '—'}
                            </div>
                            <div style={{ fontSize: 12, color: '#6B6258', marginTop: 6, fontWeight: 700 }}>{items(o)}</div>
                            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                              <button className="btn" disabled={busy === o.id || !me?.is_active} onClick={() => accept(o)}
                                style={{ flex: 1, height: 52, borderRadius: 26, background: '#FF6A0A', color: '#fff', fontWeight: 800, fontSize: 15 }}>{busy === o.id ? <span className="spinner" /> : 'Принять'}</button>
                              <button className="btn" onClick={() => skip(o)} style={{ height: 52, padding: '0 20px', borderRadius: 26, background: '#F3EADF', fontWeight: 800 }}>Пропустить</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
            <div style={{ fontSize: 11, color: '#8A7F73', marginTop: 12, fontWeight: 600 }}>Выплата за доставку настраивается рестораном.</div>
          </section>
        )}

        {tab === 'active' && (
          <section style={{ animation: 'up .3s ease both' }}>
            {active === undefined ? <div style={{ textAlign: 'center', padding: 40 }}><Spinner /></div>
              : !active ? <div style={{ ...card, marginTop: 12 }}>Нет активной доставки. Примите заказ во вкладке «Заказы».</div>
                : (
                  <>
                    <h1 className="disp" style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 4px' }}>#TB-{active.order_no}</h1>
                    <div style={{ fontSize: 13, color: '#B9AFA3', fontWeight: 700 }}>{STEP[active.status]?.label}</div>
                    <div style={{ marginTop: 14, height: 300, borderRadius: 24, overflow: 'hidden', background: '#EFE6D8' }}>
                      <Map branches={markers} pin={dest} courier={gps.pos} route={route} height="100%" center={gps.pos ?? dest ?? undefined} zoom={13} />
                    </div>
                    {gps.state === 'denied' && <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: '#FF6A0A' }}>Доступ к геолокации запрещён — клиент не видит вас на карте. Разрешите геолокацию в настройках браузера.</div>}
                    {gps.state === 'unavailable' && <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: '#FF6A0A' }}>GPS недоступен на этом устройстве.</div>}
                    <div style={{ marginTop: 12, background: '#241F1B', borderRadius: 22, padding: 16, fontSize: 14, fontWeight: 700, lineHeight: 1.55 }}>
                      <div><span style={{ color: '#B9AFA3' }}>Забрать:</span> {activeBranch ? `${activeBranch.name}, ${activeBranch.address}` : '—'}</div>
                      <div><span style={{ color: '#B9AFA3' }}>Доставить:</span> {addr(active) || '—'}</div>
                      {active.courier_instructions && <div><span style={{ color: '#B9AFA3' }}>Комментарий:</span> {active.courier_instructions}</div>}
                      <div><span style={{ color: '#B9AFA3' }}>Клиент:</span> {active.customer_name ? active.customer_name + ' · ' : ''}{formatPhone(active.contact_phone)}</div>
                      <div><span style={{ color: '#B9AFA3' }}>Оплата:</span> {PAY[active.payment_method]} · {fmt(active.total_kzt)}</div>
                      <div style={{ color: '#B9AFA3', fontSize: 12, marginTop: 4 }}>{items(active)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                      {navTarget ? (
                        <>
                          <a href={`https://2gis.kz/almaty/geo/${navTarget.lon},${navTarget.lat}`} target="_blank" rel="noopener noreferrer" className="btn"
                            style={{ flex: 1, minHeight: 52, borderRadius: 26, background: '#241F1B', fontWeight: 800, fontSize: 14, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="m3 11 18-8-8 18-2-8z" /></svg>2GIS</a>
                          <a href={`https://yandex.kz/maps/?rtext=~${navTarget.lat},${navTarget.lon}&rtt=auto`} target="_blank" rel="noopener noreferrer" className="btn"
                            style={{ flex: 1, minHeight: 52, borderRadius: 26, background: '#241F1B', fontWeight: 800, fontSize: 14, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>Яндекс</a>
                        </>
                      ) : null}
                      <a href={`tel:${active.contact_phone}`} className="btn"
                        style={{ flex: 1, minHeight: 52, borderRadius: 26, background: '#241F1B', fontWeight: 800, fontSize: 14, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>Позвонить</a>
                    </div>
                    {STEP[active.status] && (
                      <button className="btn" disabled={busy === active.id} onClick={nextStep}
                        style={{ marginTop: 12, width: '100%', height: 60, borderRadius: 30, background: '#FF6A0A', color: '#fff', fontWeight: 800, fontSize: 17, boxShadow: '0 10px 24px rgba(255,106,10,.4)' }}>
                        {busy === active.id ? <span className="spinner" /> : STEP[active.status]!.btn}
                      </button>
                    )}
                  </>
                )}
          </section>
        )}

        {tab === 'earn' && (
          <section style={{ animation: 'up .3s ease both' }}>
            <h1 className="disp" style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 12px' }}>Заработок</h1>
            <div style={{ background: '#FF6A0A', borderRadius: 26, padding: 22 }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em' }}>СЕГОДНЯ</div>
              <div className="disp" style={{ fontSize: 36, fontWeight: 800, marginTop: 6 }}>{doneToday} {doneToday === 1 ? 'доставка' : 'доставок'}</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>За 7 дней: {doneWeek} · Тариф курьера настраивается рестораном</div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 15, margin: '18px 0 8px' }}>История доставок</div>
            {!history.length ? <div style={{ color: '#B9AFA3', fontSize: 13, fontWeight: 700 }}>Пока нет завершённых доставок.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.map((d) => (
                  <div key={d.id} style={{ background: '#241F1B', borderRadius: 18, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 10, fontWeight: 700, fontSize: 14 }}>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#TB-{d.order_no} · {d.address_text ?? '—'}</span>
                    <span style={{ color: '#FF6A0A', whiteSpace: 'nowrap' }}>{d.delivered_at ? `${dateShort(d.delivered_at)} ${timeHM(d.delivered_at)}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'profile' && (
          <section style={{ animation: 'up .3s ease both' }}>
            <h1 className="disp" style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 12px' }}>Профиль</h1>
            <div style={{ background: '#241F1B', borderRadius: 22, padding: 18, fontWeight: 700, lineHeight: 1.7 }}>
              <span style={{ color: '#B9AFA3' }}>Телефон (вход по номеру)</span><br />{session.phone ? formatPhone(session.phone) : '—'}<br />
              <span style={{ color: '#B9AFA3' }}>Имя</span><br />{me?.display_name ?? '—'}<br />
              <span style={{ color: '#B9AFA3' }}>Прикреплён к</span><br />Все филиалы (настраивает админ)
            </div>
            <button className="btn" onClick={toggleOnline} disabled={!me} style={{ marginTop: 12, width: '100%', minHeight: 52, borderRadius: 26, background: '#3A332D', fontWeight: 800, color: '#fff' }}>{online ? 'Выйти с линии' : 'Выйти на линию'}</button>
            <button className="btn" onClick={async () => { await signOut(); router.replace('/'); }} style={{ marginTop: 12, width: '100%', minHeight: 52, borderRadius: 26, background: '#241F1B', fontWeight: 800, color: '#FF6A0A' }}>Выйти из аккаунта</button>
          </section>
        )}
      </main>

      <nav aria-label="Разделы курьера" style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: '#241F1B', borderRadius: '26px 26px 0 0', display: 'flex', padding: '8px 8px calc(14px + env(safe-area-inset-bottom))', zIndex: 40 }}>
        {([['offers', 'Заказы'], ['active', 'Активный'], ['earn', 'Заработок'], ['profile', 'Профиль']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} className="btn" onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}
            style={{ flex: 1, minHeight: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: tab === k ? '#FF6A0A' : '#B9AFA3', position: 'relative' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[k]}</svg>
            <span style={{ fontSize: 11, fontWeight: 800 }}>{label}</span>
            {k === 'offers' && online && visibleOffers.length > 0 && <span style={{ position: 'absolute', top: 2, right: 'calc(50% - 24px)', minWidth: 18, height: 18, borderRadius: 9, background: '#FF6A0A', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{visibleOffers.length}</span>}
            {k === 'active' && active && <span style={{ position: 'absolute', top: 4, right: 'calc(50% - 18px)', width: 8, height: 8, borderRadius: '50%', background: '#FF6A0A' }} />}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function CourierPage() {
  return (
    <StaffGuard roles={['COURIER', 'ADMIN']} next="/courier" dark>
      <Courier />
    </StaffGuard>
  );
}
