'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHead, Pager, TableWrap } from '@/components/admin/kit';
import { Spinner } from '@/components/ui';
import { dateShort } from '@/features/orders/status';
import { fmt } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { sb } from '@/lib/supabase/client';

const PAGE = 25;
interface ProfileRow { id: string; phone: string; full_name: string | null; created_at: string }

export default function AdminCustomers() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<ProfileRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Record<string, { n: number; sum: number }>>({});

  useEffect(() => { const t = setTimeout(() => { setQuery(q.replace(/\D/g, '').slice(-10)); setPage(0); }, 400); return () => clearTimeout(t); }, [q]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setRows(null);
      let req = sb().from('profiles').select('id,phone,full_name,created_at', { count: 'exact' }).order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
      if (query) req = req.ilike('phone', `%${query}%`);
      const { data, count } = await req;
      if (!alive) return;
      const list = (data as ProfileRow[]) ?? [];
      setRows(list);
      setTotal(count ?? 0);
      if (list.length) {
        const { data: ords } = await sb().from('orders').select('user_id,total_kzt,status').in('user_id', list.map((p) => p.id)).limit(5000);
        const m: Record<string, { n: number; sum: number }> = {};
        ((ords ?? []) as { user_id: string; total_kzt: number; status: string }[]).forEach((o) => {
          m[o.user_id] ??= { n: 0, sum: 0 };
          m[o.user_id].n++;
          if (o.status === 'DELIVERED') m[o.user_id].sum += o.total_kzt;
        });
        if (alive) setStats(m);
      }
    })();
    return () => { alive = false; };
  }, [query, page]);

  return (
    <>
      <PageHead title="Клиенты">
        <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по телефону" aria-label="Поиск по телефону" inputMode="numeric" style={{ maxWidth: 240, border: 0 }} />
      </PageHead>
      <TableWrap>
        <thead><tr><th>Клиент</th><th>Телефон</th><th>С нами с</th><th>Заказов</th><th>Сумма доставленных</th><th></th></tr></thead>
        <tbody>
          {rows === null && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30 }}><Spinner dark /></td></tr>}
          {rows?.length === 0 && <tr><td colSpan={6} style={{ color: '#6B6258' }}>Никого не найдено.</td></tr>}
          {rows?.map((p) => (
            <tr key={p.id}>
              <td><b>{p.full_name ?? 'Без имени'}</b></td>
              <td><a href={`tel:${p.phone}`}>{formatPhone(p.phone)}</a></td>
              <td>{dateShort(p.created_at)}</td>
              <td>{stats[p.id]?.n ?? 0}</td>
              <td>{fmt(stats[p.id]?.sum ?? 0)}</td>
              <td>{(stats[p.id]?.n ?? 0) > 0 && <Link href={`/admin/orders?q=${p.phone.slice(2)}`} style={{ color: '#C24D00', fontWeight: 800, fontSize: 13 }}>Заказы →</Link>}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <Pager page={page} pageSize={PAGE} total={total} onPage={setPage} />
    </>
  );
}
