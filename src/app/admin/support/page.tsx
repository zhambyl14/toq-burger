'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Badge, PageHead, Pager, TableWrap } from '@/components/admin/kit';
import { Spinner, toast } from '@/components/ui';
import { errText } from '@/features/admin/transitions';
import { dateShort, timeHM } from '@/features/orders/status';
import { formatPhone } from '@/lib/phone';
import { sb } from '@/lib/supabase/client';

const PAGE = 25;
type St = 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
interface Req { id: string; user_id: string; order_id: string | null; message: string; status: St; created_at: string }
const LABEL: Record<St, string> = { OPEN: 'Новое', IN_PROGRESS: 'В работе', CLOSED: 'Закрыто' };
const COLOR: Record<St, string> = { OPEN: '#E5360B', IN_PROGRESS: '#0B6EE5', CLOSED: '#6B6258' };

export default function AdminSupport() {
  const [filter, setFilter] = useState<'all' | St>('OPEN');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Req[] | null>(null);
  const [total, setTotal] = useState(0);
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [orderNos, setOrderNos] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setRows(null);
    let req = sb().from('support_requests').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (filter !== 'all') req = req.eq('status', filter);
    const { data, count } = await req;
    const list = (data as Req[]) ?? [];
    setRows(list);
    setTotal(count ?? 0);
    const uids = Array.from(new Set(list.map((r) => r.user_id)));
    const oids = list.map((r) => r.order_id).filter((x): x is string => !!x);
    const [p, o] = await Promise.all([
      uids.length ? sb().from('profiles').select('id,phone').in('id', uids) : Promise.resolve({ data: [] }),
      oids.length ? sb().from('orders').select('id,order_no').in('id', oids) : Promise.resolve({ data: [] }),
    ]);
    const pm: Record<string, string> = {};
    ((p.data ?? []) as { id: string; phone: string }[]).forEach((x) => { pm[x.id] = x.phone; });
    setPhones(pm);
    const om: Record<string, number> = {};
    ((o.data ?? []) as { id: string; order_no: number }[]).forEach((x) => { om[x.id] = x.order_no; });
    setOrderNos(om);
  }, [filter, page]);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const setStatus = async (r: Req, status: St) => {
    const { error } = await sb().from('support_requests').update({ status }).eq('id', r.id);
    if (error) return toast(errText(error.message));
    toast(`Статус: ${LABEL[status]}`);
    load();
  };

  return (
    <>
      <PageHead title="Поддержка">
        <div style={{ display: 'flex', gap: 6, background: '#fff', borderRadius: 22, padding: 4 }}>
          {(['OPEN', 'IN_PROGRESS', 'CLOSED', 'all'] as const).map((k) => (
            <button key={k} className="btn" aria-pressed={filter === k} onClick={() => { setFilter(k); setPage(0); }} style={{ minHeight: 40, padding: '0 14px', borderRadius: 18, fontWeight: 800, fontSize: 13, background: filter === k ? '#141210' : 'transparent', color: filter === k ? '#fff' : '#141210' }}>{k === 'all' ? 'Все' : LABEL[k]}</button>
          ))}
        </div>
      </PageHead>
      <TableWrap>
        <thead><tr><th>Когда</th><th>Клиент</th><th>Заказ</th><th>Сообщение</th><th>Статус</th><th></th></tr></thead>
        <tbody>
          {rows === null && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30 }}><Spinner dark /></td></tr>}
          {rows?.length === 0 && <tr><td colSpan={6} style={{ color: '#6B6258' }}>Обращений нет.</td></tr>}
          {rows?.map((r) => (
            <tr key={r.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{dateShort(r.created_at)} {timeHM(r.created_at)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{phones[r.user_id] ? <a href={`tel:${phones[r.user_id]}`}>{formatPhone(phones[r.user_id])}</a> : '—'}</td>
              <td>{r.order_id ? <Link href={`/admin/orders?open=${r.order_id}`} style={{ fontWeight: 800 }}>#TB-{orderNos[r.order_id] ?? '…'}</Link> : '—'}</td>
              <td style={{ maxWidth: 420, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{r.message}</td>
              <td><Badge color={COLOR[r.status] ?? '#6B6258'}>{LABEL[r.status] ?? r.status}</Badge></td>
              <td>
                <select className="field" value={r.status} onChange={(e) => setStatus(r, e.target.value as St)} aria-label="Изменить статус" style={{ width: 140, height: 40 }}>
                  {(Object.keys(LABEL) as St[]).map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <Pager page={page} pageSize={PAGE} total={total} onPage={setPage} />
    </>
  );
}
