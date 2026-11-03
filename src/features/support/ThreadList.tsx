'use client';
import { Spinner } from '@/components/ui';
import { dateShort, timeHM } from '@/features/orders/status';
import { formatPhone } from '@/lib/phone';
import { KindBadge, StatusBadge } from './Badges';
import { pal, type SupportReq } from './types';

interface Props {
  rows: SupportReq[] | null;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  dark?: boolean;
  /** Show requester name / phone / kind (back-office view). */
  staff?: boolean;
  phones?: Record<string, string>;
  orderNos?: Record<string, number>;
  empty?: string;
}

export function ThreadList({ rows, selectedId, onSelect, dark = false, staff = false, phones = {}, orderNos = {}, empty = 'Обращений нет.' }: Props) {
  const c = pal(dark);
  if (rows === null) return <div style={{ padding: 24, textAlign: 'center' }}><Spinner dark={!dark} /></div>;
  if (!rows.length) return <div style={{ padding: 14, color: c.muted, fontWeight: 700, fontSize: 13 }}>{empty}</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((r) => (
        <button key={r.id} className="btn" onClick={() => onSelect(r.id)} aria-current={selectedId === r.id ? 'true' : undefined}
          style={{ textAlign: 'left', width: '100%', padding: '10px 12px', borderRadius: 16, background: selectedId === r.id ? c.selected : 'transparent', color: c.text, border: `2px solid ${selectedId === r.id ? '#FF6A0A' : c.line}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {staff && <span style={{ fontWeight: 800, fontSize: 14 }}>{r.requester_name ?? 'Без имени'}</span>}
            {staff && <KindBadge kind={r.kind} />}
            <StatusBadge status={r.status} />
            {r.order_id && <span style={{ fontWeight: 800, fontSize: 12, color: dark ? '#FF6A0A' : '#C24D00' }}>{orderNos[r.order_id] != null ? `#TB-${orderNos[r.order_id]}` : 'Заказ'}</span>}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: c.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{r.message}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: c.muted }}>
            {staff && phones[r.user_id] ? `${formatPhone(phones[r.user_id])} · ` : ''}обновлено {dateShort(r.updated_at)} {timeHM(r.updated_at)}
          </span>
        </button>
      ))}
    </div>
  );
}
