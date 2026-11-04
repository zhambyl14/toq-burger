'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Logo, Spinner, toast } from '@/components/ui';
import { StaffGuard } from '@/components/staff/StaffGuard';
import { useMounted } from '@/features/catalog/hooks';
import { meatLabel } from '@/features/courier/helpers';
import { useOrderNames } from '@/features/kitchen/names';
import { StopList } from '@/features/kitchen/StopList';
import { loadMuted, saveMuted, unlockAudio } from '@/features/kitchen/sound';
import { startOfAlmatyDay, useBranchOrders, useStaffBranches } from '@/features/kitchen/useKitchen';
import { kitchenCourierTextL, orderErrL, RELEASABLE, STATUS_COLOR, statusLabel, timeHML } from '@/features/orders/status';
import { signOut, useSession } from '@/hooks/useSession';
import { useLang } from '@/i18n/LangProvider';
import { LangSwitch } from '@/i18n/LangSwitch';
import { fmt } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { sb } from '@/lib/supabase/client';
import type { OrderRow, OrderStatus } from '@/types/catalog';

type Col = 'new' | 'accepted' | 'cooking' | 'ready' | 'delivery' | 'done' | 'cancelled';

const COLS: { k: Col; label: [string, string]; color: string; statuses: OrderStatus[] }[] = [
  { k: 'new', label: ['Новые', 'Жаңалар'], color: '#E5360B', statuses: ['PENDING'] },
  { k: 'accepted', label: ['Принятые', 'Қабылданғандар'], color: '#0B6EE5', statuses: ['ACCEPTED'] },
  { k: 'cooking', label: ['Готовятся', 'Дайындалуда'], color: '#C24D00', statuses: ['PREPARING'] },
  { k: 'ready', label: ['Готовы к выдаче', 'Беруге дайын'], color: '#2E8B3F', statuses: ['READY', 'COURIER_ASSIGNED'] },
  { k: 'delivery', label: ['В доставке', 'Жеткізілуде'], color: '#7B3FE4', statuses: ['PICKED_UP', 'ON_THE_WAY'] },
  { k: 'done', label: ['Завершены', 'Аяқталған'], color: '#6B6258', statuses: ['DELIVERED'] },
  { k: 'cancelled', label: ['Отменены', 'Бас тартылған'], color: '#B3A89B', statuses: ['CANCELLED'] },
];

function nextAction(o: OrderRow): { to: OrderStatus; label: [string, string] } | null {
  if (o.status === 'PENDING') return { to: 'ACCEPTED', label: ['Принять', 'Қабылдау'] };
  if (o.status === 'ACCEPTED') return { to: 'PREPARING', label: ['Начать готовить', 'Дайындауды бастау'] };
  if (o.status === 'PREPARING') return { to: 'READY', label: ['Готово', 'Дайын'] };
  if (o.status === 'READY' && o.mode === 'PICKUP') return { to: 'DELIVERED', label: ['Выдано клиенту', 'Клиентке берілді'] };
  return null;
}

function Kitchen() {
  const { t, lang, locale } = useLang();
  const names = useOrderNames();
  const session = useSession();
  const router = useRouter();
  const isAdmin = session.roles.includes('ADMIN');
  const branches = useStaffBranches(session.user?.id, isAdmin);
  const [pickedBranch, setBranchId] = useState<string | null>(null);
  const branchId = branches?.some((b) => b.id === pickedBranch) ? pickedBranch : branches?.[0]?.id ?? null;
  const [col, setCol] = useState<Col>('new');
  const mounted = useMounted();
  const [mutedState, setMuted] = useState<boolean | null>(null);
  const muted = mutedState ?? (mounted ? loadMuted() : false);
  const [stopList, setStopList] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'release' | 'cancel'; order: OrderRow } | null>(null);
  const [reason, setReason] = useState('');
  const { orders, couriers, reload } = useBranchOrders(branchId, muted);

  useEffect(() => {
    const h = () => unlockAudio();
    window.addEventListener('pointerdown', h, { once: true });
    return () => window.removeEventListener('pointerdown', h);
  }, []);

  const today = startOfAlmatyDay();
  const byCol = useMemo(() => {
    const m: Record<Col, OrderRow[]> = { new: [], accepted: [], cooking: [], ready: [], delivery: [], done: [], cancelled: [] };
    (orders ?? []).forEach((o) => {
      const c = COLS.find((x) => x.statuses.includes(o.status));
      if (!c) return;
      if ((c.k === 'done' || c.k === 'cancelled') && o.created_at < today) return;
      m[c.k].push(o);
    });
    m.done.reverse();
    m.cancelled.reverse();
    return m;
  }, [orders, today]);

  const act = async (o: OrderRow, to: OrderStatus, note?: string) => {
    setBusy(o.id);
    const { error } = await sb().rpc('transition_order', { p_order: o.id, p_to: to, p_note: note ?? null });
    setBusy(null);
    if (error) toast(orderErrL(error.message, lang)); else toast(`#TB-${o.order_no}: ${statusLabel(to, lang)}`);
    reload();
  };
  const askCancel = (o: OrderRow) => { setReason(''); setDialog({ kind: 'cancel', order: o }); };
  const askRelease = (o: OrderRow) => { setReason(''); setDialog({ kind: 'release', order: o }); };
  const confirmDialog = async () => {
    if (!dialog) return;
    const { kind, order: o } = dialog;
    setDialog(null);
    if (kind === 'cancel') { await act(o, 'CANCELLED', 'Отменён кухней'); return; }
    setBusy(o.id);
    const { error } = await sb().rpc('release_courier', { p_order: o.id, p_reason: reason.trim() || null });
    setBusy(null);
    toast(error ? orderErrL(error.message, lang) : t('Курьер снят, подбираем другого', 'Курьер алынды, басқасын іздеудеміз'));
    reload();
  };
  const toggleMute = () => { const v = !muted; setMuted(v); saveMuted(v); toast(v ? t('Звук выключен', 'Дыбыс өшірілді') : t('Звук включён', 'Дыбыс қосылды')); };

  const list = byCol[col];
  const branch = branches?.find((b) => b.id === branchId);

  return (
    <div style={{ minHeight: '100dvh', background: '#F3EADF', display: 'flex', flexDirection: 'column' }}>
      <header style={{ flex: 'none', background: '#141210', color: '#fff', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <Logo size={44} radius={14} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="disp" style={{ fontSize: 18, fontWeight: 800 }}>{t('Кухня', 'Асхана')}{branch ? ' · ' + branch.short_name : ''}</div>
          <div style={{ fontSize: 12, color: '#B9AFA3', fontWeight: 700 }}>{t('Оператор · видит только заказы своего филиала', 'Оператор · тек өз филиалының тапсырыстарын көреді')}</div>
        </div>
        {branches && branches.length > 1 && (
          <div role="tablist" aria-label={t('Филиал', 'Филиал')} style={{ display: 'flex', gap: 6, background: '#241F1B', borderRadius: 22, padding: 4, flexWrap: 'wrap' }}>
            {branches.map((b) => (
              <button key={b.id} role="tab" aria-selected={b.id === branchId} className="btn" onClick={() => setBranchId(b.id)}
                style={{ minHeight: 44, padding: '0 16px', borderRadius: 18, fontWeight: 800, fontSize: 13, background: b.id === branchId ? '#FF6A0A' : 'transparent', color: '#fff' }}>{b.short_name}</button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <LangSwitch variant="dark" />
          <button className="btn" onClick={toggleMute} aria-pressed={!muted} aria-label={muted ? t('Включить звук', 'Дыбысты қосу') : t('Выключить звук', 'Дыбысты өшіру')}
            style={{ minHeight: 44, padding: '0 14px', borderRadius: 18, background: '#241F1B', color: '#fff', fontWeight: 800, fontSize: 13 }}>{muted ? t('🔕 Звук выкл', '🔕 Дыбыс өшірулі') : t('🔔 Звук вкл', '🔔 Дыбыс қосулы')}</button>
          {branchId && <button className="btn" onClick={() => setStopList(true)} style={{ minHeight: 44, padding: '0 14px', borderRadius: 18, background: '#241F1B', color: '#fff', fontWeight: 800, fontSize: 13 }}>{t('Стоп-лист', 'Стоп-тізім')}</button>}
          {isAdmin && <Link href="/admin" className="btn" style={{ minHeight: 44, padding: '0 14px', borderRadius: 18, background: '#241F1B', color: '#fff', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', textDecoration: 'none' }}>{t('Админ', 'Әкімші')}</Link>}
          <button className="btn" onClick={async () => { await signOut(); router.replace('/'); }} style={{ minHeight: 44, padding: '0 14px', borderRadius: 18, background: '#241F1B', color: '#B9AFA3', fontWeight: 800, fontSize: 13 }}>{t('Выйти', 'Шығу')}</button>
        </div>
      </header>

      {branches && branches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#6B6258', fontWeight: 700, fontSize: 16 }}>{t('Вы не прикреплены ни к одному филиалу. Обратитесь к администратору.', 'Сіз ешбір филиалға бекітілмегенсіз. Әкімшіге хабарласыңыз.')}</div>
      ) : (
        <>
          <div role="tablist" aria-label={t('Статус', 'Мәртебе')} style={{ flex: 'none', display: 'flex', gap: 8, padding: '16px 24px 0', flexWrap: 'wrap' }}>
            {COLS.map((c) => (
              <button key={c.k} role="tab" aria-selected={col === c.k} className="btn" onClick={() => setCol(c.k)}
                style={{ minHeight: 48, padding: '0 18px', borderRadius: 24, fontWeight: 800, fontSize: 14, background: col === c.k ? '#141210' : '#fff', color: col === c.k ? '#fff' : '#141210', display: 'flex', alignItems: 'center', gap: 8 }}>
                {t(c.label[0], c.label[1])}
                <span style={{ minWidth: 24, height: 24, padding: '0 6px', borderRadius: 12, background: c.color, color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>{byCol[c.k].length}</span>
              </button>
            ))}
          </div>

          {col === 'ready' && <div style={{ padding: '12px 24px 0', fontSize: 13, fontWeight: 800, color: '#2E8B3F' }}>{t('Доставка: передайте заказ курьеру. Самовывоз: выдайте клиенту.', 'Жеткізу: тапсырысты курьерге беріңіз. Өзі алып кету: клиентке беріңіз.')}</div>}
          <div style={{ flex: 1, padding: '16px 24px 24px' }}>
            {!orders ? (
              <div style={{ textAlign: 'center', padding: 80 }}><Spinner dark /></div>
            ) : !list.length ? (
              <div style={{ textAlign: 'center', padding: 80, color: '#6B6258', fontWeight: 700, fontSize: 16 }}>{t('В этой колонке пусто.', 'Бұл бағанда ештеңе жоқ.')}</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 16 }}>
                {list.map((o) => {
                  const color = STATUS_COLOR[o.status];
                  const nx = nextAction(o);
                  const canCancel = o.status === 'PENDING' || o.status === 'ACCEPTED';
                  const delivery = o.mode === 'DELIVERY';
                  const cInfo = o.courier_id ? couriers[o.courier_id] : undefined;
                  const canRelease = delivery && !!o.courier_id && RELEASABLE.includes(o.status);
                  const handover = delivery && (o.status === 'READY' || o.status === 'COURIER_ASSIGNED');
                  return (
                    <article key={o.id} style={{ background: '#fff', borderRadius: 22, padding: 18, borderTop: `8px solid ${color}`, animation: 'up .3s ease both', boxShadow: '0 8px 22px rgba(120,60,0,.08)', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <div className="disp" style={{ fontSize: 20, fontWeight: 800 }}>#TB-{o.order_no}</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#6B6258' }}>{timeHML(o.created_at, locale)}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        <span style={{ padding: '4px 10px', borderRadius: 10, background: color, color: '#fff', fontSize: 12, fontWeight: 800 }}>{statusLabel(o.status, lang)}</span>
                        <span style={{ padding: '4px 10px', borderRadius: 10, background: '#F3EADF', fontSize: 12, fontWeight: 800 }}>{o.mode === 'DELIVERY' ? t('Доставка', 'Жеткізу') : t('Самовывоз', 'Өзі алып кету')}</span>
                        {o.scheduled_for && <span style={{ padding: '4px 10px', borderRadius: 10, background: '#FFF1E0', color: '#C24D00', fontSize: 12, fontWeight: 800 }}>{lang === 'kk' ? `${timeHML(o.scheduled_for, locale)} уақытына` : `Ко времени ${timeHML(o.scheduled_for, locale)}`}</span>}
                      </div>
                      <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700 }}>
                        {o.customer_name ?? t('Клиент', 'Клиент')} · <a href={`tel:${o.contact_phone}`} style={{ color: '#C24D00', textDecoration: 'none' }}>{formatPhone(o.contact_phone)}</a>
                      </div>
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {o.order_items?.map((i) => (
                          <div key={i.id} style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>
                            {i.quantity}× {names.item(i)} {i.meat !== 'one' && <span style={{ color: '#C24D00' }}>{meatLabel(i.meat, lang).toLowerCase()}</span>}
                            {i.extras.length > 0 && <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 700 }}>+ {i.extras.map((e) => names.extra(e)).join(', ')}</div>}
                          </div>
                        ))}
                      </div>
                      {o.note && <div style={{ marginTop: 10, background: '#FFF1E0', borderRadius: 12, padding: '8px 12px', fontSize: 13, fontWeight: 700 }}><b>{t('Комментарий', 'Түсініктеме')}:</b> {o.note}</div>}
                      {o.mode === 'DELIVERY' && o.address_text && (
                        <div style={{ marginTop: 10, fontSize: 12, color: '#4A423A', fontWeight: 700, lineHeight: 1.4 }}>
                          {o.address_text}{o.apartment ? `, ${t('кв.', 'пәт.')} ${o.apartment}` : ''}{o.entrance ? `, ${t('подъезд', 'кіреберіс')} ${o.entrance}` : ''}{o.floor ? `, ${t('этаж', 'қабат')} ${o.floor}` : ''}
                          {o.courier_instructions && <div style={{ color: '#6B6258' }}>{t('Курьеру', 'Курьерге')}: {o.courier_instructions}</div>}
                        </div>
                      )}
                      {delivery && o.status !== 'CANCELLED' && (
                        <div style={{ marginTop: 10, borderRadius: 12, padding: '8px 12px', background: o.courier_id ? '#EEF6EF' : '#FFF1E0', fontSize: 13, fontWeight: 800, lineHeight: 1.35, display: 'flex', alignItems: 'center', gap: 8 }}>
                          {o.courier_id && cInfo && <span role="img" aria-label={cInfo.online ? t('Курьер онлайн', 'Курьер желіде') : t('Курьер офлайн', 'Курьер желіде емес')} style={{ flex: 'none', width: 10, height: 10, borderRadius: '50%', background: cInfo.online ? '#2E8B3F' : '#B3A89B' }} />}
                          <span>{kitchenCourierTextL(o.status, cInfo?.name ?? null, !!o.courier_id, lang)}{o.courier_id && cInfo && !cInfo.online ? ` (${t('не в сети', 'желіде емес')})` : ''}</span>
                        </div>
                      )}
                      {handover && o.courier_id && (
                        <div style={{ marginTop: 6, fontSize: 13, fontWeight: 800, color: '#2E8B3F' }}>{t('Передайте заказ курьеру', 'Тапсырысты курьерге беріңіз')}{cInfo ? ` ${cInfo.name}` : ''}</div>
                      )}
                      <div style={{ marginTop: 10, fontSize: 12, color: '#6B6258', fontWeight: 700, lineHeight: 1.5 }}>
                        {[o.accepted_at && `${t('принят', 'қабылданды')} ${timeHML(o.accepted_at, locale)}`, o.preparing_at && `${t('готовится', 'дайындалуда')} ${timeHML(o.preparing_at, locale)}`, o.ready_at && `${t('готов', 'дайын')} ${timeHML(o.ready_at, locale)}`, o.picked_up_at && `${t('забран', 'алынды')} ${timeHML(o.picked_up_at, locale)}`, o.delivered_at && `${t('доставлен', 'жеткізілді')} ${timeHML(o.delivered_at, locale)}`].filter(Boolean).join(' · ')}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, marginTop: 8 }}>{fmt(o.total_kzt)} · {o.payment_method === 'CASH' ? t('оплата при получении', 'алғанда төлеу') : o.payment_method === 'KASPI_QR' ? 'Kaspi QR' : t('онлайн', 'онлайн')}</div>
                      <div style={{ flex: 1 }} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                        {nx && (
                          <button className="btn" disabled={busy === o.id} onClick={() => act(o, nx.to)}
                            style={{ flex: 1, height: 56, borderRadius: 18, background: STATUS_COLOR[nx.to === 'DELIVERED' ? 'READY' : nx.to], color: '#fff', fontWeight: 800, fontSize: 16 }}>
                            {busy === o.id ? <span className="spinner" /> : t(nx.label[0], nx.label[1])}
                          </button>
                        )}
                        {canRelease && (
                          <button className="btn" disabled={busy === o.id} onClick={() => askRelease(o)}
                            style={{ flex: 1, height: 56, borderRadius: 18, background: '#F3EADF', color: '#141210', fontWeight: 800, fontSize: 14 }}>{t('Снять курьера', 'Курьерді алып тастау')}</button>
                        )}
                        {canCancel && (
                          <button className="btn" disabled={busy === o.id} onClick={() => askCancel(o)} aria-label={t('Отменить', 'Бас тарту')}
                            style={{ width: 56, height: 56, borderRadius: 18, background: '#F3EADF', color: '#B3261E', fontWeight: 800, fontSize: 18 }}>✕</button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
      {dialog && (
        <div role="presentation" onClick={() => setDialog(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 }}>
          <div role="dialog" aria-modal="true" aria-labelledby="kdlg-title" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') setDialog(null); }}
            style={{ background: '#fff', borderRadius: 24, padding: 22, width: 'min(100%, 420px)', boxShadow: '0 20px 50px rgba(0,0,0,.3)' }}>
            <div id="kdlg-title" className="disp" style={{ fontSize: 18, fontWeight: 800 }}>
              {dialog.kind === 'release' ? t(`Снять курьера с #TB-${dialog.order.order_no}?`, `#TB-${dialog.order.order_no} тапсырысынан курьерді алып тастау керек пе?`) : t(`Отменить заказ #TB-${dialog.order.order_no}?`, `#TB-${dialog.order.order_no} тапсырысын болдырмау керек пе?`)}
            </div>
            {dialog.kind === 'release' ? (
              <>
                <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 700, marginTop: 6 }}>{t('Система сразу подберёт другого курьера.', 'Жүйе бірден басқа курьерді таңдайды.')}</div>
                <label htmlFor="kdlg-reason" style={{ display: 'block', fontSize: 13, fontWeight: 800, marginTop: 14 }}>{t('Причина снятия', 'Алып тастау себебі')}</label>
                <input id="kdlg-reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') confirmDialog(); }}
                  placeholder={t('Например: курьер не приехал', 'Мысалы: курьер келмеді')} maxLength={200}
                  style={{ marginTop: 6, width: '100%', boxSizing: 'border-box', minHeight: 48, padding: '0 14px', borderRadius: 14, border: '2px solid #E5DACB', fontSize: 15, fontWeight: 700, fontFamily: 'inherit' }} />
              </>
            ) : (
              <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 700, marginTop: 6 }}>{t('Отмену заказа нельзя вернуть.', 'Тапсырысты болдырмауды қайтару мүмкін емес.')}</div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button className="btn" onClick={() => setDialog(null)} style={{ flex: 1, minHeight: 52, borderRadius: 18, background: '#F3EADF', color: '#141210', fontWeight: 800, fontSize: 14 }}>{t('Назад', 'Артқа')}</button>
              <button className="btn" onClick={confirmDialog} style={{ flex: 1, minHeight: 52, borderRadius: 18, background: dialog.kind === 'cancel' ? '#B3261E' : '#FF6A0A', color: '#fff', fontWeight: 800, fontSize: 14 }}>
                {dialog.kind === 'release' ? t('Снять курьера', 'Курьерді алып тастау') : t('Отменить заказ', 'Тапсырысты болдырмау')}
              </button>
            </div>
          </div>
        </div>
      )}
      {stopList && branchId && <StopList branchId={branchId} onClose={() => setStopList(false)} />}
    </div>
  );
}

export default function KitchenPage() {
  return (
    <StaffGuard roles={['KITCHEN', 'OPERATOR', 'ADMIN']} next="/kitchen">
      <Kitchen />
    </StaffGuard>
  );
}
