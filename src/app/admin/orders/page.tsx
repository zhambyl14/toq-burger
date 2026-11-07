'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { CourierSection, CourierStrip } from '@/components/admin/CourierPanels';
import { Badge, BranchFilter, Drawer, Label, PageHead, Pager, Panel, TableWrap, useAdminBranches } from '@/components/admin/kit';
import { Spinner, toast } from '@/components/ui';
import { type LiveCourier, useLiveCouriers } from '@/features/admin/couriers';
import { ALL_STATUSES, addDays, almatyDayStart, errText, nextStatuses } from '@/features/admin/transitions';
import { meatName } from '@/features/catalog/hooks';
import { STATUS_COLOR, STATUS_LABEL, dateShort, timeHM } from '@/features/orders/status';
import { PAY_STATE_LABEL } from '@/features/payments/settings';
import Link from 'next/link';
import { fmt } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { sb } from '@/lib/supabase/client';
import type { OrderRow, OrderStatus } from '@/types/catalog';

const PAGE = 25;

interface HistoryRow {
  id: number; from_status: OrderStatus | null; to_status: OrderStatus | null; note: string | null; created_at: string;
  actor_name: string | null; actor_role: string | null; event: 'STATUS' | 'COURIER_ASSIGNED' | 'COURIER_REJECTED' | 'COURIER_RELEASED' | 'SUPPORT_REPLY' | 'NOTE';
}
const ACTOR_ROLE: Record<string, string> = { ADMIN: 'Админ', MODERATOR: 'Модератор', KITCHEN: 'Кухня', OPERATOR: 'Оператор', COURIER: 'Курьер', CUSTOMER: 'Клиент', SYSTEM: 'Система' };
const EVENT_LABEL: Record<string, string> = { COURIER_ASSIGNED: 'Курьер назначен', COURIER_REJECTED: 'Курьер отказался', COURIER_RELEASED: 'Курьер снят', SUPPORT_REPLY: 'Ответ поддержки', NOTE: 'Заметка' };

/** «Курьер назначен: Имя (авто)» / «Курьер снят: Имя · причина» instead of the raw DB note. */
function eventText(h: HistoryRow): string {
  const note = h.note ?? '';
  if (h.event === 'COURIER_ASSIGNED') {
    if (note.startsWith('Автоназначение: ')) return `Курьер назначен: ${note.slice('Автоназначение: '.length)} · автоматически`;
    if (note.startsWith('Назначен вручную: ')) return `Курьер назначен: ${note.slice('Назначен вручную: '.length)} · вручную`;
    return `Курьер назначен${note ? `: ${note}` : ''}`;
  }
  if (h.event === 'COURIER_RELEASED') {
    return note.startsWith('Снят курьер ') ? `Курьер снят: ${note.slice('Снят курьер '.length)}` : `Курьер снят${note ? `: ${note}` : ''}`;
  }
  return `${EVENT_LABEL[h.event] ?? h.event}${note ? ` · ${note}` : ''}`;
}
interface PaymentRow { id: string; method: string; status: string; amount_kzt: number; provider: string; paid_at: string | null }

function Orders() {
  const sp = useSearchParams();
  const router = useRouter();
  const branches = useAdminBranches();
  const [br, setBr] = useState('all');
  const [status, setStatus] = useState<'all' | 'active' | OrderStatus>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [src, setSrc] = useState<'all' | 'ONLINE' | 'OFFLINE'>('all');
  const [onlyCancel, setOnlyCancel] = useState(false);
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [query, setQuery] = useState(sp.get('q') ?? '');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [reload, setReload] = useState(0);
  const openId = sp.get('open');
  const live = useLiveCouriers(false);

  useEffect(() => { const t = setTimeout(() => { setQuery(q.trim()); setPage(0); }, 400); return () => clearTimeout(t); }, [q]);
  // every filter change resets pagination
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0); };

  useEffect(() => {
    let alive = true;
    (async () => {
    let req = sb().from('orders').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (br !== 'all') req = req.eq('branch_id', br);
    if (src !== 'all') req = req.eq('source', src);
    if (onlyCancel) req = req.not('cancel_requested_at', 'is', null);
    if (status === 'active') req = req.in('status', ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COURIER_ASSIGNED', 'PICKED_UP', 'ON_THE_WAY']);
    else if (status !== 'all') req = req.eq('status', status);
    if (from) req = req.gte('created_at', almatyDayStart(from));
    if (to) req = req.lt('created_at', almatyDayStart(addDays(to, 1)));
    if (query) {
      const digits = query.replace(/\D/g, '');
      const compact = query.replace(/\s/g, '');
      if (/^#?TB-?\d{1,7}$/i.test(compact) || /^#\d{1,7}$/.test(compact)) req = req.eq('order_no', Number(digits));
      else if (/^\d{1,3}$/.test(compact)) req = req.eq('order_no', Number(digits));
      else if (/^\d{4,7}$/.test(compact)) req = req.or(`order_no.eq.${Number(digits)},contact_phone.ilike.%${digits}%`);
      else if (digits.length >= 4) req = req.ilike('contact_phone', `%${digits.slice(-10)}%`);
    }
    setRows(null);
    const { data, count } = await req;
    if (!alive) return;
    setRows((data as OrderRow[]) ?? []);
    setTotal(count ?? 0);
    })();
    return () => { alive = false; };
  }, [br, status, from, to, src, onlyCancel, query, page, reload]);

  // live refresh when any order changes
  useEffect(() => {
    const ch = sb().channel('admin-orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => setReload((r) => r + 1)).subscribe();
    return () => { sb().removeChannel(ch); };
  }, []);

  const brName = (id: string) => branches.find((b) => b.id === id)?.short_name ?? '—';
  const courierCell = (o: OrderRow): string => {
    if (o.mode !== 'DELIVERY') return '—';
    if (o.courier_id) return live.couriers.find((c) => c.user_id === o.courier_id)?.display_name ?? 'Курьер';
    return ['ACCEPTED', 'PREPARING', 'READY', 'COURIER_ASSIGNED'].includes(o.status) ? 'ищем' : '—';
  };
  const open = (id: string | null) => router.replace(id ? `/admin/orders?open=${id}` : '/admin/orders', { scroll: false });

  return (
    <>
      <PageHead title="Заказы"><BranchFilter value={br} onChange={reset(setBr)} /></PageHead>
      <CourierStrip couriers={live.couriers} ready={live.ready} />
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="№ заказа или телефон" aria-label="Поиск" style={{ maxWidth: 240, border: 0 }} />
        <select className="field" value={status} onChange={(e) => reset(setStatus)(e.target.value as typeof status)} aria-label="Статус" style={{ maxWidth: 200, border: 0 }}>
          <option value="all">Все статусы</option>
          <option value="active">Активные</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select className="field" value={src} onChange={(e) => reset(setSrc)(e.target.value as typeof src)} aria-label="Источник" style={{ maxWidth: 190, border: 0 }}>
          <option value="all">Онлайн + офлайн</option>
          <option value="ONLINE">Только онлайн</option>
          <option value="OFFLINE">Только офлайн (зал/касса)</option>
        </select>
        <button className="btn" aria-pressed={onlyCancel} onClick={() => reset(setOnlyCancel)(!onlyCancel)} style={{ minHeight: 48, padding: '0 14px', borderRadius: 14, background: onlyCancel ? '#B3261E' : '#fff', color: onlyCancel ? '#fff' : '#141210', fontWeight: 800, fontSize: 13 }}>Запросы отмены</button>
        <input className="field" type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label="С даты" style={{ maxWidth: 170, border: 0 }} />
        <input className="field" type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label="По дату" style={{ maxWidth: 170, border: 0 }} />
        {(q || status !== 'all' || from || to || src !== 'all' || onlyCancel) && <button className="btn" onClick={() => { setQ(''); setStatus('all'); setFrom(''); setTo(''); setSrc('all'); setOnlyCancel(false); setPage(0); }} style={{ minHeight: 48, padding: '0 14px', borderRadius: 14, background: '#fff', fontWeight: 800, fontSize: 13 }}>Сбросить</button>}
      </div>

      <TableWrap>
        <thead><tr><th>Заказ</th><th>Время</th><th>Филиал</th><th>Тип</th><th>Клиент</th><th>Статус</th><th>Курьер</th><th>Оплата</th><th>Сумма</th></tr></thead>
        <tbody>
          {rows === null && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 30 }}><Spinner dark /></td></tr>}
          {rows?.length === 0 && <tr><td colSpan={9} style={{ color: '#6B6258' }}>Ничего не найдено.</td></tr>}
          {rows?.map((o) => (
            <tr key={o.id} className="click" onClick={() => open(o.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') open(o.id); }}>
              <td><b>#TB-{o.order_no}</b></td>
              <td style={{ whiteSpace: 'nowrap' }}>{dateShort(o.created_at)} {timeHM(o.created_at)}</td>
              <td>{brName(o.branch_id)}</td>
              <td>{o.source === 'OFFLINE' ? <Badge color="#0B6EE5">Зал / касса</Badge> : o.mode === 'DELIVERY' ? 'Доставка' : 'Самовывоз'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{o.customer_name ?? ''} {formatPhone(o.contact_phone)}</td>
              <td style={{ whiteSpace: 'nowrap' }}><Badge color={STATUS_COLOR[o.status]}>{STATUS_LABEL[o.status]}</Badge>{o.cancel_requested_at && <span title={o.cancel_request_reason ?? ''} style={{ marginLeft: 6, color: '#B3261E', fontWeight: 800, fontSize: 12 }}>⚠ отмена?</span>}</td>
              <td style={{ whiteSpace: 'nowrap', fontWeight: 700, color: courierCell(o) === 'ищем' ? '#C24D00' : undefined }}>{courierCell(o)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{o.payment_method === 'CASH' ? 'Наличные' : o.payment_method === 'KASPI_QR' ? 'Kaspi' : o.source === 'OFFLINE' ? 'Карта (касса)' : 'Онлайн'}{o.payment_state !== 'NOT_REQUIRED' && <div style={{ fontSize: 11, fontWeight: 800, color: o.payment_state === 'CONFIRMED' ? '#2E8B3F' : o.payment_state === 'REJECTED' ? '#B3261E' : '#C24D00' }}>{PAY_STATE_LABEL[o.payment_state][0]}</div>}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{fmt(o.total_kzt)}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <Pager page={page} pageSize={PAGE} total={total} onPage={setPage} />
      {openId && <OrderDrawer id={openId} onClose={() => open(null)} brName={brName} couriers={live.couriers} onChanged={() => setReload((r) => r + 1)} />}
    </>
  );
}

function OrderDrawer({ id, onClose, brName, couriers, onChanged }: { id: string; onClose: () => void; brName: (id: string) => string; couriers: LiveCourier[]; onChanged: () => void }) {
  const [o, setO] = useState<OrderRow | null>(null);
  const [hist, setHist] = useState<HistoryRow[]>([]);
  const [pays, setPays] = useState<PaymentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const [a, h, p] = await Promise.all([
      sb().from('orders').select('*, order_items(*)').eq('id', id).maybeSingle(),
      sb().from('order_status_history').select('id,from_status,to_status,note,created_at,actor_name,actor_role,event').eq('order_id', id).order('created_at').order('id'),
      sb().from('payments').select('id,method,status,amount_kzt,provider,paid_at').eq('order_id', id),
    ]);
    if (a.error) toast(errText(a.error.message));
    if (h.error) toast(errText(h.error.message));
    if (p.error) toast(errText(p.error.message));
    const order = a.data as OrderRow | null;
    setO(order);
    setHist((h.data as HistoryRow[]) ?? []);
    setPays((p.data as PaymentRow[]) ?? []);
  }, [id]);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  // realtime: new history rows for the open order
  useEffect(() => {
    const ch = sb().channel(`order-history-${id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_status_history', filter: `order_id=eq.${id}` }, () => { load(); }).subscribe();
    return () => { sb().removeChannel(ch); };
  }, [id, load]);

  const move = async (to: OrderStatus) => {
    if (!o) return;
    if (to === 'CANCELLED' && note.trim().length < 3) return toast('Укажите причину отмены в поле комментария');
    if (to === 'CANCELLED' && !confirm(`Отменить заказ #TB-${o.order_no}?`)) return;
    setBusy(true);
    const { error } = await sb().rpc('transition_order', { p_order: o.id, p_to: to, p_note: note.trim() || null });
    setBusy(false);
    if (error) return toast(errText(error.message));
    toast(`Статус: ${STATUS_LABEL[to]}`);
    setNote('');
    load(); onChanged();
  };
  const resolve = async (approve: boolean) => {
    if (!o) return;
    if (approve && !confirm(`Отменить заказ #TB-${o.order_no} по запросу кухни?`)) return;
    setBusy(true);
    const { error } = await sb().rpc('resolve_cancel_request', { p_order: o.id, p_approve: approve, p_note: note.trim() || null });
    setBusy(false);
    if (error) return toast(errText(error.message));
    toast(approve ? 'Заказ отменён' : 'Запрос отклонён');
    setNote('');
    load(); onChanged();
  };
  return (
    <Drawer open onClose={onClose} title={o ? `Заказ #TB-${o.order_no}` : 'Заказ'}>
      {!o ? <div style={{ textAlign: 'center', padding: 40 }}><Spinner dark /></div> : (
        <>
          <Panel>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Badge color={STATUS_COLOR[o.status]}>{STATUS_LABEL[o.status]}</Badge>
              <span style={{ fontWeight: 800, fontSize: 13 }}>{o.mode === 'DELIVERY' ? 'Доставка' : 'Самовывоз'} · {brName(o.branch_id)}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 10 }}>{o.customer_name ?? 'Клиент'} · <a href={`tel:${o.contact_phone}`} style={{ color: '#C24D00' }}>{formatPhone(o.contact_phone)}</a></div>
            {o.address_text && <div style={{ fontSize: 13, color: '#4A423A', marginTop: 6, lineHeight: 1.4 }}>{o.address_text}{o.apartment ? `, кв. ${o.apartment}` : ''}{o.entrance ? `, подъезд ${o.entrance}` : ''}{o.floor ? `, этаж ${o.floor}` : ''}{o.intercom ? `, домофон ${o.intercom}` : ''}</div>}
            {o.courier_instructions && <div style={{ fontSize: 13, marginTop: 6 }}><b>Курьеру:</b> {o.courier_instructions}</div>}
            {o.note && <div style={{ fontSize: 13, marginTop: 6, background: '#FFF1E0', borderRadius: 12, padding: '8px 12px' }}><b>Комментарий:</b> {o.note}</div>}
            {o.scheduled_for && <div style={{ fontSize: 13, marginTop: 6, fontWeight: 800, color: '#C24D00' }}>Ко времени: {dateShort(o.scheduled_for)} {timeHM(o.scheduled_for)}</div>}
          </Panel>

          {o.cancel_requested_at && (
            <Panel style={{ marginTop: 12, border: '2px solid #B3261E' }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#B3261E' }}>Кухня просит отменить заказ</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6 }}>Причина: {o.cancel_request_reason}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="btn" disabled={busy} onClick={() => resolve(true)} style={{ minHeight: 44, padding: '0 16px', borderRadius: 14, background: '#B3261E', color: '#fff', fontWeight: 800, fontSize: 13 }}>Отменить заказ</button>
                <button className="btn" disabled={busy} onClick={() => resolve(false)} style={{ minHeight: 44, padding: '0 16px', borderRadius: 14, background: '#F3EADF', fontWeight: 800, fontSize: 13 }}>Отклонить запрос</button>
              </div>
              <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 6 }}>Комментарий ниже (в «Действиях») попадёт в историю.</div>
            </Panel>
          )}

          <CourierSection order={o} couriers={couriers} onChanged={() => { load(); onChanged(); }} />

          <Panel style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Состав</div>
            {o.order_items?.map((it) => (
              <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', fontSize: 14, fontWeight: 700 }}>
                <span>{it.quantity}× {it.product_name}{it.meat !== 'one' ? ` · ${meatName(it.meat)}` : ''}{it.extras.length ? ` + ${it.extras.map((e) => e.name).join(', ')}` : ''}</span>
                <span style={{ whiteSpace: 'nowrap' }}>{fmt(it.line_total_kzt)}</span>
              </div>
            ))}
            <div style={{ borderTop: '2px dashed #F3EADF', marginTop: 8, paddingTop: 8, fontSize: 13, fontWeight: 700, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Сумма</span><span>{fmt(o.subtotal_kzt)}</span></div>
              {o.discount_kzt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2E8B3F' }}><span>Скидка</span><span>−{fmt(o.discount_kzt)}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Доставка</span><span>{fmt(o.delivery_fee_kzt)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800 }}><span>Итого</span><span>{fmt(o.total_kzt)}</span></div>
            </div>
          </Panel>

          <Panel style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Оплата{o.source === 'OFFLINE' ? ' · принята на кассе' : ''}</div>
            {o.payment_state !== 'NOT_REQUIRED' && o.payment_state !== 'CONFIRMED' && o.status === 'PENDING' && (
              <div style={{ fontSize: 13, fontWeight: 800, marginTop: 6 }}><span style={{ color: '#C24D00' }}>{PAY_STATE_LABEL[o.payment_state][0]}</span> · <Link href="/admin/payments" style={{ color: '#0B6EE5' }}>перейти к проверке →</Link></div>
            )}
            {pays.map((p) => (
              <div key={p.id} style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>
                {p.method} · {fmt(p.amount_kzt)} · <span style={{ color: p.status === 'PAID' ? '#2E8B3F' : '#C24D00' }}>{p.status === 'PAID' ? 'оплачено' : p.status === 'PENDING' ? 'ожидает оплаты' : p.status === 'REFUNDED' ? 'возвращено' : p.status === 'FAILED' ? 'не оплачено' : p.status}</span>
                <span style={{ color: '#6B6258' }}> · провайдер: {p.provider}</span>
              </div>
            ))}
          </Panel>

          <Panel style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Действия</div>
            <Label>КОММЕНТАРИЙ К ДЕЙСТВИЮ (необязательно)</Label>
            <input className="field" value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="Причина / примечание" />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {nextStatuses(o.status, o.mode).map((s) => (
                <button key={s} className="btn" disabled={busy} onClick={() => move(s)}
                  style={{ minHeight: 44, padding: '0 16px', borderRadius: 14, fontWeight: 800, fontSize: 13, background: s === 'CANCELLED' ? '#F3EADF' : STATUS_COLOR[s], color: s === 'CANCELLED' ? '#B3261E' : '#fff' }}>
                  {s === 'CANCELLED' ? 'Отменить заказ' : `→ ${STATUS_LABEL[s]}`}
                </button>
              ))}
              {o.status === 'READY' && o.mode === 'DELIVERY' && <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 700, alignSelf: 'center' }}>Курьер заберёт заказ и сам отметит выдачу.</div>}
              {!nextStatuses(o.status, o.mode).length && <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 700 }}>Заказ завершён.</div>}
            </div>
          </Panel>

          <Panel style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>История</div>
            {hist.length === 0 && <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 8 }}>Записей пока нет.</div>}
            {hist.map((h) => (
              <div key={h.id} style={{ display: 'flex', gap: 10, fontSize: 13, fontWeight: 700, marginTop: 10 }}>
                <span style={{ color: '#6B6258', whiteSpace: 'nowrap' }}>{dateShort(h.created_at)} {timeHM(h.created_at)}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#C24D00' }}>{h.actor_role === 'SYSTEM' || !h.actor_role ? (h.actor_name ?? 'Система') : `${h.actor_name ?? 'Система'} · ${ACTOR_ROLE[h.actor_role] ?? h.actor_role}`}</div>
                  {h.event === 'STATUS' ? (
                    <div>{h.from_status ? STATUS_LABEL[h.from_status] : 'создан'} → <b>{h.to_status ? STATUS_LABEL[h.to_status] : '—'}</b>{h.note ? ` · ${h.note}` : ''}</div>
                  ) : (
                    <div><b>{eventText(h)}</b></div>
                  )}
                </div>
              </div>
            ))}
          </Panel>
        </>
      )}
    </Drawer>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense>
      <Orders />
    </Suspense>
  );
}
