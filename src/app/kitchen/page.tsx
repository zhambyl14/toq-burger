'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Logo, Spinner, toast } from '@/components/ui';
import { StaffGuard } from '@/components/staff/StaffGuard';
import { meatName, useMounted } from '@/features/catalog/hooks';
import { StopList } from '@/features/kitchen/StopList';
import { loadMuted, saveMuted, unlockAudio } from '@/features/kitchen/sound';
import { startOfAlmatyDay, useBranchOrders, useStaffBranches } from '@/features/kitchen/useKitchen';
import { orderErr, STATUS_COLOR, STATUS_LABEL, timeHM } from '@/features/orders/status';
import { signOut, useSession } from '@/hooks/useSession';
import { fmt } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { sb } from '@/lib/supabase/client';
import type { OrderRow, OrderStatus } from '@/types/catalog';

type Col = 'new' | 'accepted' | 'cooking' | 'ready' | 'delivery' | 'done' | 'cancelled';

const COLS: { k: Col; label: string; color: string; statuses: OrderStatus[] }[] = [
  { k: 'new', label: 'Новые', color: '#E5360B', statuses: ['PENDING'] },
  { k: 'accepted', label: 'Принятые', color: '#0B6EE5', statuses: ['ACCEPTED'] },
  { k: 'cooking', label: 'Готовятся', color: '#C24D00', statuses: ['PREPARING'] },
  { k: 'ready', label: 'Готовы к выдаче', color: '#2E8B3F', statuses: ['READY', 'COURIER_ASSIGNED'] },
  { k: 'delivery', label: 'В доставке', color: '#7B3FE4', statuses: ['PICKED_UP', 'ON_THE_WAY'] },
  { k: 'done', label: 'Завершены', color: '#6B6258', statuses: ['DELIVERED'] },
  { k: 'cancelled', label: 'Отменены', color: '#B3A89B', statuses: ['CANCELLED'] },
];

function nextAction(o: OrderRow): { to: OrderStatus; label: string } | null {
  if (o.status === 'PENDING') return { to: 'ACCEPTED', label: 'Принять' };
  if (o.status === 'ACCEPTED') return { to: 'PREPARING', label: 'Начать готовить' };
  if (o.status === 'PREPARING') return { to: 'READY', label: 'Готово' };
  if (o.status === 'READY' && o.mode === 'PICKUP') return { to: 'DELIVERED', label: 'Выдано клиенту' };
  return null;
}

function Kitchen() {
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
    if (error) toast(orderErr(error.message)); else toast(`#TB-${o.order_no}: ${STATUS_LABEL[to]}`);
    reload();
  };
  const cancel = (o: OrderRow) => {
    if (!confirm(`Отменить заказ #TB-${o.order_no}?`)) return;
    act(o, 'CANCELLED', 'Отменён кухней');
  };
  const releaseCourier = async (o: OrderRow) => {
    const reason = prompt('Причина снятия курьера', 'Курьер не приехал');
    if (reason === null) return;
    setBusy(o.id);
    const { error } = await sb().rpc('release_courier', { p_order: o.id, p_reason: reason });
    setBusy(null);
    toast(error ? orderErr(error.message) : 'Курьер снят, заказ снова доступен курьерам');
    reload();
  };
  const toggleMute = () => { const v = !muted; setMuted(v); saveMuted(v); toast(v ? 'Звук выключен' : 'Звук включён'); };

  const list = byCol[col];
  const branch = branches?.find((b) => b.id === branchId);

  return (
    <div style={{ minHeight: '100dvh', background: '#F3EADF', display: 'flex', flexDirection: 'column' }}>
      <header style={{ flex: 'none', background: '#141210', color: '#fff', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <Logo size={44} radius={14} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="disp" style={{ fontSize: 18, fontWeight: 800 }}>Кухня{branch ? ' · ' + branch.short_name : ''}</div>
          <div style={{ fontSize: 12, color: '#B9AFA3', fontWeight: 700 }}>Оператор · видит только заказы своего филиала</div>
        </div>
        {branches && branches.length > 1 && (
          <div role="tablist" aria-label="Филиал" style={{ display: 'flex', gap: 6, background: '#241F1B', borderRadius: 22, padding: 4, flexWrap: 'wrap' }}>
            {branches.map((b) => (
              <button key={b.id} role="tab" aria-selected={b.id === branchId} className="btn" onClick={() => setBranchId(b.id)}
                style={{ minHeight: 44, padding: '0 16px', borderRadius: 18, fontWeight: 800, fontSize: 13, background: b.id === branchId ? '#FF6A0A' : 'transparent', color: '#fff' }}>{b.short_name}</button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn" onClick={toggleMute} aria-pressed={!muted} aria-label={muted ? 'Включить звук' : 'Выключить звук'}
            style={{ minHeight: 44, padding: '0 14px', borderRadius: 18, background: '#241F1B', color: '#fff', fontWeight: 800, fontSize: 13 }}>{muted ? '🔕 Звук выкл' : '🔔 Звук вкл'}</button>
          {branchId && <button className="btn" onClick={() => setStopList(true)} style={{ minHeight: 44, padding: '0 14px', borderRadius: 18, background: '#241F1B', color: '#fff', fontWeight: 800, fontSize: 13 }}>Стоп-лист</button>}
          {isAdmin && <Link href="/admin" className="btn" style={{ minHeight: 44, padding: '0 14px', borderRadius: 18, background: '#241F1B', color: '#fff', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', textDecoration: 'none' }}>Админ</Link>}
          <button className="btn" onClick={async () => { await signOut(); router.replace('/'); }} style={{ minHeight: 44, padding: '0 14px', borderRadius: 18, background: '#241F1B', color: '#B9AFA3', fontWeight: 800, fontSize: 13 }}>Выйти</button>
        </div>
      </header>

      {branches && branches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#6B6258', fontWeight: 700, fontSize: 16 }}>Вы не прикреплены ни к одному филиалу. Обратитесь к администратору.</div>
      ) : (
        <>
          <div role="tablist" aria-label="Статус" style={{ flex: 'none', display: 'flex', gap: 8, padding: '16px 24px 0', flexWrap: 'wrap' }}>
            {COLS.map((c) => (
              <button key={c.k} role="tab" aria-selected={col === c.k} className="btn" onClick={() => setCol(c.k)}
                style={{ minHeight: 48, padding: '0 18px', borderRadius: 24, fontWeight: 800, fontSize: 14, background: col === c.k ? '#141210' : '#fff', color: col === c.k ? '#fff' : '#141210', display: 'flex', alignItems: 'center', gap: 8 }}>
                {c.label}
                <span style={{ minWidth: 24, height: 24, padding: '0 6px', borderRadius: 12, background: c.color, color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>{byCol[c.k].length}</span>
              </button>
            ))}
          </div>

          <div style={{ flex: 1, padding: '16px 24px 24px' }}>
            {!orders ? (
              <div style={{ textAlign: 'center', padding: 80 }}><Spinner dark /></div>
            ) : !list.length ? (
              <div style={{ textAlign: 'center', padding: 80, color: '#6B6258', fontWeight: 700, fontSize: 16 }}>В этой колонке пусто.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 16 }}>
                {list.map((o) => {
                  const color = STATUS_COLOR[o.status];
                  const nx = nextAction(o);
                  const canCancel = o.status === 'PENDING' || o.status === 'ACCEPTED';
                  const courier = o.mode === 'PICKUP' ? '—' : o.courier_id ? (couriers[o.courier_id] ?? 'назначен') : (o.status === 'READY' ? 'ищем курьера…' : 'не назначен');
                  return (
                    <article key={o.id} style={{ background: '#fff', borderRadius: 22, padding: 18, borderTop: `8px solid ${color}`, animation: 'up .3s ease both', boxShadow: '0 8px 22px rgba(120,60,0,.08)', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <div className="disp" style={{ fontSize: 20, fontWeight: 800 }}>#TB-{o.order_no}</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#6B6258' }}>{timeHM(o.created_at)}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        <span style={{ padding: '4px 10px', borderRadius: 10, background: color, color: '#fff', fontSize: 12, fontWeight: 800 }}>{STATUS_LABEL[o.status]}</span>
                        <span style={{ padding: '4px 10px', borderRadius: 10, background: '#F3EADF', fontSize: 12, fontWeight: 800 }}>{o.mode === 'DELIVERY' ? 'Доставка' : 'Самовывоз'}</span>
                        {o.scheduled_for && <span style={{ padding: '4px 10px', borderRadius: 10, background: '#FFF1E0', color: '#C24D00', fontSize: 12, fontWeight: 800 }}>Ко времени {timeHM(o.scheduled_for)}</span>}
                      </div>
                      <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700 }}>
                        {o.customer_name ?? 'Клиент'} · <a href={`tel:${o.contact_phone}`} style={{ color: '#C24D00', textDecoration: 'none' }}>{formatPhone(o.contact_phone)}</a>
                      </div>
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {o.order_items?.map((i) => (
                          <div key={i.id} style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>
                            {i.quantity}× {i.product_name} {i.meat !== 'one' && <span style={{ color: '#C24D00' }}>{meatName(i.meat).toLowerCase()}</span>}
                            {i.extras.length > 0 && <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 700 }}>+ {i.extras.map((e) => e.name).join(', ')}</div>}
                          </div>
                        ))}
                      </div>
                      {o.note && <div style={{ marginTop: 10, background: '#FFF1E0', borderRadius: 12, padding: '8px 12px', fontSize: 13, fontWeight: 700 }}><b>Комментарий:</b> {o.note}</div>}
                      {o.mode === 'DELIVERY' && o.address_text && (
                        <div style={{ marginTop: 10, fontSize: 12, color: '#4A423A', fontWeight: 700, lineHeight: 1.4 }}>
                          {o.address_text}{o.apartment ? `, кв. ${o.apartment}` : ''}{o.entrance ? `, подъезд ${o.entrance}` : ''}{o.floor ? `, этаж ${o.floor}` : ''}
                          {o.courier_instructions && <div style={{ color: '#6B6258' }}>Курьеру: {o.courier_instructions}</div>}
                        </div>
                      )}
                      <div style={{ marginTop: 10, fontSize: 12, color: '#6B6258', fontWeight: 700, lineHeight: 1.5 }}>
                        Курьер: {courier}
                        <br />
                        {[o.accepted_at && `принят ${timeHM(o.accepted_at)}`, o.preparing_at && `готовится ${timeHM(o.preparing_at)}`, o.ready_at && `готов ${timeHM(o.ready_at)}`, o.picked_up_at && `забран ${timeHM(o.picked_up_at)}`, o.delivered_at && `доставлен ${timeHM(o.delivered_at)}`].filter(Boolean).join(' · ')}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, marginTop: 8 }}>{fmt(o.total_kzt)} · {o.payment_method === 'CASH' ? 'оплата при получении' : o.payment_method === 'KASPI_QR' ? 'Kaspi QR' : 'онлайн'}</div>
                      <div style={{ flex: 1 }} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                        {nx && (
                          <button className="btn" disabled={busy === o.id} onClick={() => act(o, nx.to)}
                            style={{ flex: 1, height: 56, borderRadius: 18, background: STATUS_COLOR[nx.to === 'DELIVERED' ? 'READY' : nx.to], color: '#fff', fontWeight: 800, fontSize: 16 }}>
                            {busy === o.id ? <span className="spinner" /> : nx.label}
                          </button>
                        )}
                        {o.status === 'COURIER_ASSIGNED' && (
                          <button className="btn" disabled={busy === o.id} onClick={() => releaseCourier(o)}
                            style={{ flex: 1, height: 56, borderRadius: 18, background: '#F3EADF', color: '#141210', fontWeight: 800, fontSize: 14 }}>Снять курьера</button>
                        )}
                        {canCancel && (
                          <button className="btn" disabled={busy === o.id} onClick={() => cancel(o)} aria-label="Отменить"
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
