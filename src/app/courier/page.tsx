'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo, toast } from '@/components/ui';
import { StaffGuard } from '@/components/staff/StaffGuard';
import { useMounted, useNowMinute } from '@/features/catalog/hooks';
import { OrdersTab } from '@/features/courier/OrdersTab';
import { alertNewOrder, loadCourierMuted, saveCourierMuted } from '@/features/courier/notify';
import { courierErr, offlineBlocked, useCourierData, useDispatchPing, useCourierGps } from '@/features/courier/useCourier';
import { unlockAudio } from '@/features/kitchen/sound';
import { startOfAlmatyDay } from '@/features/kitchen/useKitchen';
import { SupportCenter } from '@/features/support/SupportCenter';
import { dateShortL, timeHML } from '@/features/orders/status';
import { signOut, useSession } from '@/hooks/useSession';
import { useLang } from '@/i18n/LangProvider';
import { LangSwitch } from '@/i18n/LangSwitch';
import { formatPhone } from '@/lib/phone';
import { sb } from '@/lib/supabase/client';
import type { OrderRow, OrderStatus } from '@/types/catalog';

type Tab = 'orders' | 'earn' | 'support' | 'profile';

const ICONS: Record<Tab, React.ReactNode> = {
  orders: <><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></>,
  earn: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  support: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
};

const TABS: [Tab, string, string][] = [['orders', 'Заказы', 'Тапсырыстар'], ['earn', 'История', 'Тарих'], ['support', 'Поддержка', 'Қолдау қызметі'], ['profile', 'Профиль', 'Профиль']];

function Courier() {
  const { t, lang, locale } = useLang();
  const session = useSession();
  const router = useRouter();
  const nowMin = useNowMinute();
  const mounted = useMounted();
  const uid = session.user?.id;
  const [tab, setTab] = useState<Tab>('orders');
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ many: boolean; nos: string } | null>(null);
  const [mutedState, setMuted] = useState<boolean | null>(null);
  const muted = mutedState ?? (mounted ? loadCourierMuted() : false);
  const mutedRef = useRef(false);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const onNew = useCallback((fresh: OrderRow[]) => {
    alertNewOrder(mutedRef.current);
    setBanner({ many: fresh.length > 1, nos: fresh.map((o) => '#TB-' + o.order_no).join(', ') });
  }, []);

  const { me, setMe, orders, history, branches, reload } = useCourierData(uid, onNew);
  const online = !!me?.is_online;
  const hasActive = (orders?.length ?? 0) > 0;
  const gps = useCourierGps(online);
  useDispatchPing(online, reload);

  useEffect(() => {
    const h = () => unlockAudio();
    window.addEventListener('pointerdown', h, { once: true });
    return () => window.removeEventListener('pointerdown', h);
  }, []);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 9000);
    return () => clearTimeout(t);
  }, [banner]);

  const lockedOnline = online && hasActive;
  const toggleDisabled = !me || lockedOnline || (!online && !me.is_active);

  const toggleOnline = async () => {
    if (!uid || !me) return;
    if (lockedOnline) { toast(offlineBlocked(lang)); return; }
    const v = !online;
    const { error } = await sb().from('couriers').update({ is_online: v }).eq('user_id', uid);
    if (error) { toast(courierErr(error.message, lang)); return; }
    setMe({ ...me, is_online: v }); // the dispatch ping starts automatically once online
    toast(v ? t('Вы на линии', 'Сіз желідесіз') : t('Вы ушли с линии', 'Сіз желіден шықтыңыз'));
  };

  const toggleMute = () => {
    const v = !muted;
    setMuted(v);
    saveCourierMuted(v);
    if (!v) alertNewOrder(false);
  };

  const step = async (o: OrderRow, to: OrderStatus) => {
    if (to === 'DELIVERED' && !confirm(t(`Подтвердите: заказ #TB-${o.order_no} передан клиенту?`, `Растаңыз: #TB-${o.order_no} тапсырысы клиентке берілді ме?`))) return;
    setBusy(o.id);
    const { error } = await sb().rpc('transition_order', { p_order: o.id, p_to: to, p_note: null });
    setBusy(null);
    if (error) { toast(courierErr(error.message, lang)); void reload(); return; }
    toast(to === 'DELIVERED' ? t(`Заказ #TB-${o.order_no} доставлен`, `#TB-${o.order_no} тапсырысы жеткізілді`) : to === 'PICKED_UP' ? t('Заказ у вас — везите клиенту', 'Тапсырыс сізде — клиентке апарыңыз') : t('Статус обновлён', 'Мәртебе жаңартылды'));
    await reload();
  };

  const todayStart = nowMin ? startOfAlmatyDay(nowMin) : '';
  const weekStart = nowMin ? new Date(nowMin.getTime() - 7 * 86400_000).toISOString() : '';
  const doneToday = history.filter((h) => (h.delivered_at ?? '') >= todayStart).length;
  const doneWeek = history.filter((h) => (h.delivered_at ?? '') >= weekStart).length;
  const readyCount = (orders ?? []).filter((o) => o.status === 'READY' || o.status === 'COURIER_ASSIGNED').length;

  const card = { background: '#241F1B', borderRadius: 22, padding: 28, textAlign: 'center' as const, fontWeight: 700, color: '#B9AFA3' };
  const gpsChip = gps.state === 'watching'
    ? gps.pos ? { text: t('GPS активен', 'GPS белсенді'), color: '#4CC764' } : { text: t('Определяем место…', 'Орналасқан жер анықталуда…'), color: '#B9AFA3' }
    : gps.state === 'denied' ? { text: t('GPS: нет доступа', 'GPS: рұқсат жоқ'), color: '#FF6A0A' }
      : gps.state === 'unavailable' ? { text: t('GPS недоступен', 'GPS қолжетімсіз'), color: '#FF6A0A' } : null;

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', minHeight: '100dvh', background: '#141210', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      {banner && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 24px)', maxWidth: 536, zIndex: 60, background: '#FF6A0A', color: '#fff', borderRadius: 20, padding: '10px 10px 10px 16px', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 12px 30px rgba(0,0,0,.5)', animation: 'up .3s ease both' }}>
          <span style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 15 }}>{banner.many ? t('Новые заказы', 'Жаңа тапсырыстар') : t('Новый заказ', 'Жаңа тапсырыс')} {banner.nos}</span>
          <button className="btn" onClick={() => { setTab('orders'); setBanner(null); }} style={{ minHeight: 40, padding: '0 14px', borderRadius: 20, background: '#fff', color: '#C24D00', fontWeight: 800, fontSize: 13 }}>{t('Смотреть', 'Қарау')}</button>
          <button className="btn" onClick={() => setBanner(null)} aria-label={t('Закрыть уведомление', 'Хабарландыруды жабу')} style={{ width: 40, height: 40, borderRadius: 20, background: 'rgba(0,0,0,.2)', color: '#fff', fontWeight: 800, fontSize: 18 }}>×</button>
        </div>
      )}

      <header style={{ flex: 'none', padding: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Logo size={44} radius={14} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#FF6A0A', letterSpacing: '.1em' }}>{t('КУРЬЕР', 'КУРЬЕР')}</div>
          <div style={{ fontWeight: 800, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me?.display_name ?? t('Курьер', 'Курьер')}</div>
        </div>
        <button className="btn" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? t('Включить звук уведомлений', 'Хабарландыру дыбысын қосу') : t('Выключить звук уведомлений', 'Хабарландыру дыбысын өшіру')}
          style={{ width: 44, height: 44, borderRadius: 22, background: '#3A332D', color: muted ? '#8A7F73' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9v6h3l5 4V5L9 9z" />{muted ? <path d="m17 9 5 6M22 9l-5 6" /> : <path d="M17.5 8.5a5 5 0 0 1 0 7M20 6a8.5 8.5 0 0 1 0 12" />}
          </svg>
        </button>
        <button className="btn" onClick={toggleOnline} disabled={toggleDisabled} aria-pressed={online} aria-describedby={lockedOnline ? 'online-hint' : undefined}
          style={{ minHeight: 44, padding: '0 16px', borderRadius: 22, background: online ? '#2E8B3F' : '#3A332D', color: '#fff', fontWeight: 800, fontSize: 13, opacity: lockedOnline ? 0.85 : 1 }}>{online ? t('На линии', 'Желіде') : t('Не на линии', 'Желіде емес')}</button>
      </header>

      <div style={{ padding: '0 16px 10px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lockedOnline && <div id="online-hint" style={{ fontSize: 12, fontWeight: 700, color: '#B9AFA3' }}>{offlineBlocked(lang)}</div>}
          {gpsChip && (
            <div>
              <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#241F1B', borderRadius: 14, padding: '5px 11px', fontSize: 12, fontWeight: 800, color: gpsChip.color }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: gpsChip.color }} />{gpsChip.text}
              </span>
              {gps.state === 'denied' && (
                <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: '#FF6A0A', lineHeight: 1.5 }}>
                  {t('Доступ к геолокации запрещён. Нажмите на значок замка в адресной строке браузера, разрешите «Местоположение» для этого сайта и перезагрузите страницу. Без GPS система не сможет выбрать вас ближайшим курьером.', 'Геолокацияға қол жеткізуге тыйым салынған. Браузердің мекенжай жолындағы құлып белгішесін басып, осы сайт үшін «Орналасқан жер» рұқсатын беріңіз де, бетті қайта жүктеңіз. GPS болмаса, жүйе сізді ең жақын курьер ретінде таңдай алмайды.')}
                </div>
              )}
              {gps.state === 'unavailable' && (
                <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: '#FF6A0A', lineHeight: 1.5 }}>
                  {t('Не удаётся определить местоположение. Включите GPS на устройстве и проверьте, что браузер имеет к нему доступ.', 'Орналасқан жерді анықтау мүмкін емес. Құрылғыда GPS қосып, браузердің оған қолжетімділігі бар екенін тексеріңіз.')}
                </div>
              )}
            </div>
          )}
        </div>
        <LangSwitch variant="dark" />
      </div>

      <main style={{ flex: 1, overflowY: 'auto', padding: '0 16px 100px' }}>
        {me && !me.is_active && <div style={{ ...card, marginBottom: 12, color: '#FF6A0A' }}>{t('Аккаунт курьера отключён администратором.', 'Курьер аккаунтын әкімші өшірді.')}</div>}

        {tab === 'orders' && (
          <section style={{ animation: 'up .3s ease both' }}>
            <h1 className="disp" style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 12px' }}>{t('Мои заказы', 'Менің тапсырыстарым')}</h1>
            <OrdersTab orders={orders} branches={branches} online={online} accountActive={!!me?.is_active} busy={busy}
              gpsPos={gps.pos} onStep={step} onGoOnline={toggleOnline} />
          </section>
        )}

        {tab === 'earn' && (
          <section style={{ animation: 'up .3s ease both' }}>
            <h1 className="disp" style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 12px' }}>{t('История доставок', 'Жеткізу тарихы')}</h1>
            <div style={{ background: '#FF6A0A', borderRadius: 26, padding: 22 }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em' }}>{t('СЕГОДНЯ', 'БҮГІН')}</div>
              <div className="disp" style={{ fontSize: 36, fontWeight: 800, marginTop: 6 }}>{doneToday} {lang === 'kk' ? 'жеткізу' : doneToday % 10 === 1 && doneToday % 100 !== 11 ? 'доставка' : doneToday % 10 >= 2 && doneToday % 10 <= 4 && (doneToday % 100 < 12 || doneToday % 100 > 14) ? 'доставки' : 'доставок'}</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>{t('За 7 дней', 'Соңғы 7 күнде')}: {doneWeek}</div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 15, margin: '18px 0 8px' }}>{t('Последние доставки', 'Соңғы жеткізулер')}</div>
            {!history.length ? <div style={{ color: '#B9AFA3', fontSize: 13, fontWeight: 700 }}>{t('Пока нет завершённых доставок.', 'Аяқталған жеткізулер әзірге жоқ.')}</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.slice(0, 40).map((d) => (
                  <div key={d.id} style={{ background: '#241F1B', borderRadius: 18, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 10, fontWeight: 700, fontSize: 14 }}>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#TB-{d.order_no} · {d.address_text ?? '—'}</span>
                    <span style={{ color: '#FF6A0A', whiteSpace: 'nowrap' }}>{d.delivered_at ? `${dateShortL(d.delivered_at, locale)} ${timeHML(d.delivered_at, locale)}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'support' && (
          <section style={{ animation: 'up .3s ease both' }}>
            <h1 className="disp" style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 12px' }}>{t('Поддержка', 'Қолдау қызметі')}</h1>
            <div style={{ background: '#241F1B', borderRadius: 22, padding: 16 }}>
              <SupportCenter kind="COURIER" dark />
            </div>
          </section>
        )}

        {tab === 'profile' && (
          <section style={{ animation: 'up .3s ease both' }}>
            <h1 className="disp" style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 12px' }}>{t('Профиль', 'Профиль')}</h1>
            <div style={{ background: '#241F1B', borderRadius: 22, padding: 18, fontWeight: 700, lineHeight: 1.7 }}>
              <span style={{ color: '#B9AFA3' }}>{t('Телефон (вход по номеру)', 'Телефон (нөмір бойынша кіру)')}</span><br />{session.phone ? formatPhone(session.phone) : '—'}<br />
              <span style={{ color: '#B9AFA3' }}>{t('Имя', 'Аты')}</span><br />{me?.display_name ?? '—'}<br />
              <span style={{ color: '#B9AFA3' }}>{t('Работа', 'Жұмыс')}</span><br />{t('Все филиалы — заказы назначаются автоматически', 'Барлық филиалдар — тапсырыстар автоматты түрде тағайындалады')}
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#241F1B', borderRadius: 22, padding: '12px 18px', fontWeight: 700 }}>
              <span style={{ color: '#B9AFA3' }}>{t('Язык', 'Тіл')}</span>
              <LangSwitch variant="dark" />
            </div>
            <button className="btn" onClick={toggleOnline} disabled={toggleDisabled} style={{ marginTop: 12, width: '100%', minHeight: 52, borderRadius: 26, background: '#3A332D', fontWeight: 800, color: '#fff' }}>{online ? t('Выйти с линии', 'Желіден шығу') : t('Выйти на линию', 'Желіге шығу')}</button>
            {lockedOnline && <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: '#B9AFA3', textAlign: 'center' }}>{offlineBlocked(lang)}</div>}
            <button className="btn" onClick={async () => { await signOut(); router.replace('/'); }} style={{ marginTop: 12, width: '100%', minHeight: 52, borderRadius: 26, background: '#241F1B', fontWeight: 800, color: '#FF6A0A' }}>{t('Выйти из аккаунта', 'Аккаунттан шығу')}</button>
          </section>
        )}
      </main>

      <nav aria-label={t('Разделы курьера', 'Курьер бөлімдері')} style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 560, background: '#241F1B', borderRadius: '26px 26px 0 0', display: 'flex', padding: '8px 8px calc(14px + env(safe-area-inset-bottom))', zIndex: 40 }}>
        {TABS.map(([k, ru, kk]) => (
          <button key={k} className="btn" onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}
            style={{ flex: 1, minHeight: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: tab === k ? '#FF6A0A' : '#B9AFA3', position: 'relative' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[k]}</svg>
            <span style={{ fontSize: 11, fontWeight: 800, textAlign: 'center' }}>{t(ru, kk)}</span>
            {k === 'orders' && hasActive && (
              <span aria-label={`${t('Активных заказов', 'Белсенді тапсырыстар')}: ${orders?.length ?? 0}`} style={{ position: 'absolute', top: 2, right: 'calc(50% - 24px)', minWidth: 18, height: 18, borderRadius: 9, background: readyCount > 0 ? '#2E8B3F' : '#FF6A0A', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{orders?.length}</span>
            )}
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
