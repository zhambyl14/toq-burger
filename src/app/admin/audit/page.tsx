'use client';
import { useEffect, useState } from 'react';
import { PageHead, Pager, TableWrap } from '@/components/admin/kit';
import { Spinner } from '@/components/ui';
import { dateShort, timeHM } from '@/features/orders/status';
import { formatPhone } from '@/lib/phone';
import { sb } from '@/lib/supabase/client';

const PAGE = 50;
interface Log { id: number; actor_id: string | null; action: string; entity: string; entity_id: string | null; details: unknown; created_at: string }

const ENTITY: Record<string, string> = {
  branches: 'Филиал', branch_working_hours: 'Часы работы', products: 'Продукт', product_variants: 'Цена/вариант', product_extras: 'Добавка',
  product_availability: 'Наличие', promotions: 'Промокод', user_roles: 'Роль', couriers: 'Курьер', staff_invites: 'Доступ сотрудника', orders: 'Заказ',
};
const ACTION: Record<string, string> = { insert: 'создание', update: 'изменение', delete: 'удаление', release_courier: 'снятие курьера' };

function summary(l: Log): string {
  const d = l.details as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return '';
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object';
  if (isObj(d.old) && isObj(d.new)) {
    const o = d.old, n = d.new;
    return Object.keys(n).filter((k) => k !== 'updated_at' && JSON.stringify(o[k]) !== JSON.stringify(n[k]))
      .map((k) => `${k}: ${JSON.stringify(o[k])} → ${JSON.stringify(n[k])}`).join('; ').slice(0, 300);
  }
  return String(d.name ?? d.code ?? d.phone ?? d.reason ?? '').slice(0, 200);
}

export default function AdminAudit() {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Log[] | null>(null);
  const [total, setTotal] = useState(0);
  const [actors, setActors] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      setRows(null);
      const { data, count } = await sb().from('audit_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
      if (!alive) return;
      const list = (data as Log[]) ?? [];
      setRows(list);
      setTotal(count ?? 0);
      const ids = Array.from(new Set(list.map((l) => l.actor_id).filter((x): x is string => !!x)));
      if (ids.length) {
        const { data: p } = await sb().from('profiles').select('id,phone').in('id', ids);
        const m: Record<string, string> = {};
        ((p ?? []) as { id: string; phone: string }[]).forEach((x) => { m[x.id] = formatPhone(x.phone); });
        if (alive) setActors(m);
      }
    })();
    return () => { alive = false; };
  }, [page]);

  return (
    <>
      <PageHead title="Журнал действий" />
      <TableWrap>
        <thead><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Объект</th><th>Изменения</th></tr></thead>
        <tbody>
          {rows === null && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 30 }}><Spinner dark /></td></tr>}
          {rows?.length === 0 && <tr><td colSpan={5} style={{ color: '#6B6258' }}>Записей нет.</td></tr>}
          {rows?.map((l) => (
            <tr key={l.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{dateShort(l.created_at)} {timeHM(l.created_at)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{l.actor_id ? actors[l.actor_id] ?? 'сотрудник' : 'система'}</td>
              <td>{ACTION[l.action] ?? l.action}</td>
              <td>{ENTITY[l.entity] ?? l.entity}</td>
              <td style={{ fontSize: 12, color: '#4A423A', maxWidth: 520, wordBreak: 'break-word' }}>{summary(l)}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <Pager page={page} pageSize={PAGE} total={total} onPage={setPage} />
    </>
  );
}
