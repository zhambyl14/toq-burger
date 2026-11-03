'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Badge, BranchFilter, Drawer, Label, PageHead, Pager, Panel, TableWrap, useAdminBranches } from '@/components/admin/kit';
import { Spinner, toast } from '@/components/ui';
import { ALL_STATUSES, addDays, almatyDayStart, errText, nextStatuses } from '@/features/admin/transitions';
import { meatName } from '@/features/catalog/hooks';
import { STATUS_COLOR, STATUS_LABEL, dateShort, timeHM } from '@/features/orders/status';
import { fmt } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { sb } from '@/lib/supabase/client';
import type { OrderRow, OrderStatus } from '@/types/catalog';

const PAGE = 25;

interface HistoryRow { id: number; from_status: OrderStatus | null; to_status: OrderStatus; note: string | null; created_at: string }
interface PaymentRow { id: string; method: string; status: string; amount_kzt: number; provider: string; paid_at: string | null }

function Orders() {
  const sp = useSearchParams();
  const router = useRouter();
  const branches = useAdminBranches();
  const [br, setBr] = useState('all');
  const [status, setStatus] = useState<'all' | 'active' | OrderStatus>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [query, setQuery] = useState(sp.get('q') ?? '');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [reload, setReload] = useState(0);
  const openId = sp.get('open');

  useEffect(() => { const t = setTimeout(() => { setQuery(q.trim()); setPage(0); }, 400); return () => clearTimeout(t); }, [q]);
  // every filter change resets pagination
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0); };

  useEffect(() => {
    let alive = true;
    (async () => {
    let req = sb().from('orders').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (br !== 'all') req = req.eq('branch_id', br);
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
  }, [br, status, from, to, query, page, reload]);

  // live refresh when any order changes
  useEffect(() => {
    const ch = sb().channel('admin-orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => setReload((r) => r + 1)).subscribe();
    return () => { sb().removeChannel(ch); };
  }, []);

  const brName = (id: string) => branches.find((b) => b.id === id)?.short_name ?? '—';
  const open = (id: string | null) => router.replace(id ? `/admin/orders?open=${id}` : '/admin/orders', { scroll: false });

  return (
    <>
      <PageHead title="Заказы"><BranchFilter value={br} onChange={reset(setBr)} /></PageHead>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="№ заказа или телефон" aria-label="Поиск" style={{ maxWidth: 240, border: 0 }} />
        <select className="field" value={status} onChange={(e) => reset(setStatus)(e.target.value as typeof status)} aria-label="Статус" style={{ maxWidth: 200, border: 0 }}>
          <option value="all">Все статусы</option>
          <option value="active">Активные</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <input className="field" type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label="С даты" style={{ maxWidth: 170, border: 0 }} />
        <input className="field" type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label="По дату" style={{ maxWidth: 170, border: 0 }} />
        {(q || status !== 'all' || from || to) && <button className="btn" onClick={() => { setQ(''); setStatus('all'); setFrom(''); setTo(''); setPage(0); }} style={{ minHeight: 48, padding: '0 14px', borderRadius: 14, background: '#fff', fontWeight: 800, fontSize: 13 }}>Сбросить</button>}
      </div>

      <TableWrap>
        <thead><tr><th>Заказ</th><th>Время</th><th>Филиал</th><th>Тип</th><th>Клиент</th><th>Статус</th><th>Оплата</th><th>Сумма</th></tr></thead>
        <tbody>
          {rows === null && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30 }}><Spinner dark /></td></tr>}
          {rows?.length === 0 && <tr><td colSpan={8} style={{ color: '#6B6258' }}>Ничего не найдено.</td></tr>}
          {rows?.map((o) => (
            <tr key={o.id} className="click" onClick={() => open(o.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') open(o.id); }}>
              <td><b>#TB-{o.order_no}</b></td>
              <td style={{ whiteSpace: 'nowrap' }}>{dateShort(o.created_at)} {timeHM(o.created_at)}</td>
              <td>{brName(o.branch_id)}</td>
              <td>{o.mode === 'DELIVERY' ? 'Доставка' : 'Самовывоз'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{o.customer_name ?? ''} {formatPhone(o.contact_phone)}</td>
              <td><Badge color={STATUS_COLOR[o.status]}>{STATUS_LABEL[o.status]}</Badge></td>
              <td>{o.payment_method === 'CASH' ? 'Наличные' : o.payment_method === 'KASPI_QR' ? 'Kaspi QR' : 'Онлайн'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{fmt(o.total_kzt)}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <Pager page={page} pageSize={PAGE} total={total} onPage={setPage} />
      {openId && <OrderDrawer id={openId} onClose={() => open(null)} brName={brName} onChanged={() => setReload((r) => r + 1)} />}
    </>
  );
}

function OrderDrawer({ id, onClose, brName, onChanged }: { id: string; onClose: () => void; brName: (id: string) => string; onChanged: () => void }) {
  const [o, setO] = useState<OrderRow | null>(null);
  const [hist, setHist] = useState<HistoryRow[]>([]);
  const [pays, setPays] = useState<PaymentRow[]>([]);
  const [courier, setCourier] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const [a, h, p] = await Promise.all([
      sb().from('orders').select('*, order_items(*)').eq('id', id).maybeSingle(),
      sb().from('order_status_history').select('id,from_status,to_status,note,created_at').eq('order_id', id).order('created_at'),
      sb().from('payments').select('id,method,status,amount_kzt,provider,paid_at').eq('order_id', id),
    ]);
    const order = a.data as OrderRow | null;
    setO(order);
    setHist((h.data as HistoryRow[]) ?? []);
    setPays((p.data as PaymentRow[]) ?? []);
    if (order?.courier_id) {
      const { data } = await sb().from('couriers').select('display_name').eq('user_id', order.courier_id).maybeSingle();
      setCourier(data?.display_name ?? 'Курьер');
    } else setCourier(null);
  }, [id]);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const move = async (to: OrderStatus) => {
    if (!o) return;
    if (to === 'CANCELLED' && !confirm(`Отменить заказ #TB-${o.order_no}?`)) return;
    setBusy(true);
    const { error } = await sb().rpc('transition_order', { p_order: o.id, p_to: to, p_note: note.trim() || null });
    setBusy(false);
    if (error) return toast(errText(error.message));
    toast(`Статус: ${STATUS_LABEL[to]}`);
    setNote('');
    load(); onChanged();
  };
  const release = async () => {
    if (!o || !confirm('Снять курьера с заказа? Заказ вернётся в «Готов».')) return;
    setBusy(true);
    const { error } = await sb().rpc('release_courier', { p_order: o.id, p_reason: note.trim() || null });
    setBusy(false);
    if (error) return toast(errText(error.message));
    toast('Курьер снят, заказ снова доступен курьерам');
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
            <div style={{ fontSize: 13, marginTop: 6, color: '#6B6258', fontWeight: 700 }}>Курьер: {courier ?? (o.mode === 'DELIVERY' ? 'не назначен' : '—')}</div>
          </Panel>

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
            <div style={{ fontWeight: 800, fontSize: 15 }}>Оплата</div>
            {pays.map((p) => (
              <div key={p.id} style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>
                {p.method} · {fmt(p.amount_kzt)} · <span style={{ color: p.status === 'PAID' ? '#2E8B3F' : '#C24D00' }}>{p.status === 'PAID' ? 'оплачено' : p.status === 'PENDING' ? 'ожидает оплаты' : p.status}</span>
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
              {o.status === 'COURIER_ASSIGNED' && (
                <button className="btn" disabled={busy} onClick={release} style={{ minHeight: 44, padding: '0 16px', borderRadius: 14, fontWeight: 800, fontSize: 13, background: '#141210', color: '#fff' }}>Снять курьера</button>
              )}
              {o.status === 'READY' && o.mode === 'DELIVERY' && <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 700, alignSelf: 'center' }}>Ожидает, пока курьер примет заказ.</div>}
              {!nextStatuses(o.status, o.mode).length && o.status !== 'COURIER_ASSIGNED' && <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 700 }}>Заказ завершён.</div>}
            </div>
          </Panel>

          <Panel style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>История статусов</div>
            {hist.map((h) => (
              <div key={h.id} style={{ display: 'flex', gap: 10, fontSize: 13, fontWeight: 700, marginTop: 8 }}>
                <span style={{ color: '#6B6258', whiteSpace: 'nowrap' }}>{dateShort(h.created_at)} {timeHM(h.created_at)}</span>
                <span>{h.from_status ? `${STATUS_LABEL[h.from_status]} → ` : ''}<b>{STATUS_LABEL[h.to_status]}</b>{h.note ? ` · ${h.note}` : ''}</span>
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
