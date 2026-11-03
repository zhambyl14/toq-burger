'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Badge, BranchFilter, PageHead, Panel, TableWrap, useAdminBranches } from '@/components/admin/kit';
import { Spinner, toast } from '@/components/ui';
import { addDays, almatyDayStart, almatyToday, errText } from '@/features/admin/transitions';
import { ACTIVE, STATUS_COLOR, STATUS_LABEL, timeHM, dateShort } from '@/features/orders/status';
import { fmt } from '@/lib/money';
import { sb } from '@/lib/supabase/client';
import type { OrderStatus } from '@/types/catalog';

interface StatRow { branch_id: string; branch_name: string; orders_total: number; orders_delivered: number; orders_cancelled: number; revenue_kzt: number; avg_check_kzt: number }
interface MiniOrder { id: string; order_no: number; branch_id: string; status: OrderStatus; total_kzt: number; created_at: string }

const PERIODS: [number, string][] = [[1, 'Сегодня'], [7, '7 дней'], [30, '30 дней']];

export default function AdminDashboard() {
  const branches = useAdminBranches();
  const [br, setBr] = useState('all');
  const [days, setDays] = useState(1);
  const [stats, setStats] = useState<StatRow[] | null>(null);
  const [hours, setHours] = useState<{ hour: number; orders: number }[]>([]);
  const [recent, setRecent] = useState<MiniOrder[]>([]);
  const [share, setShare] = useState<{ n: string; q: number }[]>([]);
  const [active, setActive] = useState(0);
  const [online, setOnline] = useState(0);

  useEffect(() => {
    let alive = true;
    const today = almatyToday();
    const from = almatyDayStart(addDays(today, -(days - 1)));
    const to = almatyDayStart(addDays(today, 1));
    (async () => {
      setStats(null);
      let aq = sb().from('orders').select('id', { count: 'exact', head: true }).in('status', ACTIVE);
      let rq = sb().from('orders').select('id,order_no,branch_id,status,total_kzt,created_at').order('created_at', { ascending: false }).limit(10);
      if (br !== 'all') { aq = aq.eq('branch_id', br); rq = rq.eq('branch_id', br); }
      const pb = br === 'all' ? null : br;
      const [s, a, r, c, t, h] = await Promise.all([
        sb().rpc('admin_stats', { p_from: from, p_to: to }), aq, rq,
        sb().from('couriers').select('user_id', { count: 'exact', head: true }).eq('is_online', true).eq('is_active', true),
        sb().rpc('admin_top_items', { p_from: from, p_to: to, p_branch: pb }),
        sb().rpc('admin_orders_by_hour', { p_from: from, p_to: to, p_branch: pb }),
      ]);
      if (!alive) return;
      const failed = [s, a, r, c, t, h].find((x) => x.error);
      if (failed?.error) toast(errText(failed.error.message));
      setStats((s.data as StatRow[]) ?? []);
      setHours((h.data as { hour: number; orders: number }[]) ?? []);
      setActive(a.count ?? 0);
      setRecent((r.data as MiniOrder[]) ?? []);
      setOnline(c.count ?? 0);
      setShare(((t.data as { product_name: string; qty: number }[]) ?? []).slice(0, 6).map((x) => ({ n: x.product_name, q: Number(x.qty) })));
    })();
    return () => { alive = false; };
  }, [br, days]);

  const rows = useMemo(() => (stats ?? []).filter((s) => br === 'all' || s.branch_id === br), [stats, br]);
  const tot = rows.reduce((a, r) => ({ n: a.n + Number(r.orders_total), d: a.d + Number(r.orders_delivered), c: a.c + Number(r.orders_cancelled), rev: a.rev + Number(r.revenue_kzt) }), { n: 0, d: 0, c: 0, rev: 0 });
  const avg = tot.d ? Math.round(tot.rev / tot.d) : 0;

  // orders by hour (Almaty)
  const bars = useMemo(() => {
    const h = new Array(24).fill(0) as number[];
    hours.forEach((o) => { if (o.hour >= 0 && o.hour < 24) h[o.hour] = Number(o.orders); });
    const max = Math.max(1, ...h);
    return h.map((v, i) => ({ l: String(i).padStart(2, '0'), v, p: Math.round((v / max) * 100) }));
  }, [hours]);
  const shareTotal = share.reduce((a, s) => a + s.q, 0) || 1;
  const brName = (id: string) => branches.find((b) => b.id === id)?.short_name ?? '—';

  return (
    <>
      <PageHead title="Обзор"><BranchFilter value={br} onChange={setBr} /></PageHead>
      <div style={{ display: 'flex', gap: 6, marginTop: 14, background: '#fff', borderRadius: 22, padding: 4, width: 'fit-content' }}>
        {PERIODS.map(([d, l]) => (
          <button key={d} className="btn" aria-pressed={days === d} onClick={() => setDays(d)} style={{ minHeight: 40, padding: '0 14px', borderRadius: 18, fontWeight: 800, fontSize: 13, background: days === d ? '#FF6A0A' : 'transparent', color: days === d ? '#fff' : '#141210' }}>{l}</button>
        ))}
      </div>

      {stats === null ? <div style={{ padding: 60, textAlign: 'center' }}><Spinner dark /></div> : (
        <>
          <div className="admin-grid4" style={{ marginTop: 20 }}>
            {[
              { l: 'ЗАКАЗЫ', v: String(tot.n), s: `доставлено ${tot.d} · отменено ${tot.c}` },
              { l: 'ВЫРУЧКА', v: fmt(tot.rev), s: 'по доставленным заказам' },
              { l: 'СРЕДНИЙ ЧЕК', v: fmt(avg), s: 'по доставленным заказам' },
              { l: 'АКТИВНЫЕ СЕЙЧАС', v: String(active), s: `курьеров на линии: ${online}` },
            ].map((k) => (
              <Panel key={k.l}><div style={{ fontSize: 12, fontWeight: 800, color: '#6B6258' }}>{k.l}</div><div className="disp" style={{ fontSize: 26, fontWeight: 800, marginTop: 8 }}>{k.v}</div><div style={{ fontSize: 12, color: '#6B6258', fontWeight: 700, marginTop: 4 }}>{k.s}</div></Panel>
            ))}
          </div>
          <div className="admin-grid32" style={{ marginTop: 16 }}>
            <Panel>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Заказы по часам</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 180, marginTop: 16 }} role="img" aria-label="Количество заказов по часам">
                {bars.map((b) => (
                  <div key={b.l} title={`${b.l}:00 — ${b.v}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                    <div style={{ width: '100%', height: `${b.p}%`, minHeight: b.v ? 4 : 0, background: '#FF6A0A', borderRadius: '6px 6px 0 0' }} />
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6B6258', marginTop: 6 }}>{Number(b.l) % 3 === 0 ? b.l : ''}</div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Популярные позиции</div>
              {!share.length ? <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 14 }}>Нет доставленных заказов за период.</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                  {share.map((s) => {
                    const p = Math.round((s.q / shareTotal) * 100);
                    return (
                      <div key={s.n}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}><span>{s.n}</span><span>{s.q} шт · {p}%</span></div>
                        <div style={{ height: 8, borderRadius: 4, background: '#F3EADF', marginTop: 4 }}><div style={{ height: '100%', width: `${p}%`, borderRadius: 4, background: '#141210' }} /></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>

          <TableWrap>
            <thead><tr><th>Филиал</th><th>Заказов</th><th>Доставлено</th><th>Отменено</th><th>Выручка</th><th>Средний чек</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.branch_id}><td><b>{r.branch_name}</b></td><td>{r.orders_total}</td><td>{r.orders_delivered}</td><td>{r.orders_cancelled}</td><td>{fmt(Number(r.revenue_kzt))}</td><td>{fmt(Number(r.avg_check_kzt))}</td></tr>
              ))}
            </tbody>
          </TableWrap>

          <div style={{ display: 'flex', alignItems: 'center', marginTop: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>Последние заказы</div>
            <Link href="/admin/orders" style={{ color: '#C24D00', fontWeight: 800, fontSize: 14 }}>Все заказы →</Link>
          </div>
          <TableWrap>
            <thead><tr><th>Заказ</th><th>Время</th><th>Филиал</th><th>Статус</th><th>Сумма</th></tr></thead>
            <tbody>
              {!recent.length && <tr><td colSpan={5} style={{ color: '#6B6258' }}>Заказов пока нет.</td></tr>}
              {recent.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/admin/orders?open=${o.id}`} style={{ fontWeight: 800 }}>#TB-{o.order_no}</Link></td>
                  <td>{dateShort(o.created_at)} {timeHM(o.created_at)}</td>
                  <td>{brName(o.branch_id)}</td>
                  <td><Badge color={STATUS_COLOR[o.status]}>{STATUS_LABEL[o.status]}</Badge></td>
                  <td>{fmt(o.total_kzt)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </>
      )}
    </>
  );
}
