'use client';
import { useMemo, useState } from 'react';
import { PageHead } from '@/components/admin/kit';
import { toast } from '@/components/ui';
import { ThreadList } from '@/features/support/ThreadList';
import { ThreadView } from '@/features/support/ThreadView';
import { STATUS_LABEL, type SupportKind, type SupportStatus } from '@/features/support/types';
import { setThreadStatus, useThreads } from '@/features/support/useSupport';

type StatusFilter = 'all' | SupportStatus;
type KindFilter = 'all' | SupportKind;

const STATUS_OPTS: { k: StatusFilter; label: string }[] = [
  { k: 'OPEN', label: 'Новое' }, { k: 'IN_PROGRESS', label: 'В работе' }, { k: 'CLOSED', label: 'Закрыто' }, { k: 'all', label: 'Все' },
];
const KIND_OPTS: { k: KindFilter; label: string }[] = [
  { k: 'all', label: 'Все' }, { k: 'CUSTOMER', label: 'Клиенты' }, { k: 'COURIER', label: 'Курьеры' },
];

function Seg<T extends string>({ opts, value, onChange, label }: { opts: { k: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="admin-scroll-x" style={{ display: 'flex', gap: 4, background: '#fff', borderRadius: 22, padding: 4, overflowX: 'auto', maxWidth: '100%' }}>
      {opts.map((o) => (
        <button key={o.k} className="btn" aria-pressed={value === o.k} onClick={() => onChange(o.k)}
          style={{ flex: 'none', minHeight: 40, padding: '0 14px', borderRadius: 18, fontWeight: 800, fontSize: 13, background: value === o.k ? '#141210' : 'transparent', color: value === o.k ? '#fff' : '#141210' }}>{o.label}</button>
      ))}
    </div>
  );
}

export default function AdminSupport() {
  const [status, setStatus] = useState<StatusFilter>('OPEN');
  const [kind, setKind] = useState<KindFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const filters = useMemo(() => ({ status, kind }), [status, kind]);
  const { rows, phones, orderNos, reload } = useThreads('all', filters);

  const shown = useMemo(() => {
    if (!rows) return null;
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    const digits = q.replace(/\D/g, '');
    return rows.filter((r) => (r.requester_name ?? '').toLowerCase().includes(q) || (digits.length >= 3 && (phones[r.user_id] ?? '').replace(/\D/g, '').includes(digits)));
  }, [rows, search, phones]);

  const change = async (id: string, to: SupportStatus, done: () => void) => {
    const ok = await setThreadStatus(id, to);
    if (!ok) return;
    toast(`Статус: ${STATUS_LABEL[to]}`);
    done();
  };

  return (
    <>
      <style>{`
        .sup-grid{display:grid;grid-template-columns:minmax(300px,380px) 1fr;gap:16px;margin-top:16px;align-items:start}
        @media (max-width: 860px){
          .sup-grid{grid-template-columns:1fr}
          .sup-grid[data-sel="1"] .sup-list{display:none}
          .sup-grid[data-sel="0"] .sup-detail{display:none}
        }
      `}</style>
      <PageHead title="Поддержка" />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        <Seg opts={STATUS_OPTS} value={status} onChange={(v) => { setStatus(v); setSelected(null); }} label="Статус" />
        <Seg opts={KIND_OPTS} value={kind} onChange={(v) => { setKind(v); setSelected(null); }} label="Кто обратился" />
        <input className="field" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по имени или телефону" aria-label="Поиск" style={{ maxWidth: 280, flex: 1 }} />
      </div>
      <div className="sup-grid" data-sel={selected ? '1' : '0'}>
        <div className="sup-list" style={{ background: '#fff', borderRadius: 22, padding: 12, maxHeight: 'calc(100dvh - 220px)', overflowY: 'auto' }}>
          <ThreadList rows={shown} selectedId={selected} onSelect={setSelected} staff phones={phones} orderNos={orderNos} empty="Обращений нет." />
        </div>
        <div className="sup-detail" style={{ background: '#fff', borderRadius: 22, padding: 16, minHeight: 300 }}>
          {selected ? (
            <ThreadView key={selected} requestId={selected} staff bodyHeight="calc(100dvh - 430px)" onBack={() => setSelected(null)} onActivity={reload}
              actions={({ req, done }) => (
                <>
                  {req.status !== 'IN_PROGRESS' && req.status !== 'CLOSED' && (
                    <button className="btn" onClick={() => change(req.id, 'IN_PROGRESS', done)} style={{ minHeight: 40, padding: '0 14px', borderRadius: 14, background: '#0B6EE5', color: '#fff', fontWeight: 800, fontSize: 13 }}>В работе</button>
                  )}
                  {req.status !== 'CLOSED' && (
                    <button className="btn" onClick={() => change(req.id, 'CLOSED', done)} style={{ minHeight: 40, padding: '0 14px', borderRadius: 14, background: '#141210', color: '#fff', fontWeight: 800, fontSize: 13 }}>Закрыть</button>
                  )}
                  {req.status === 'CLOSED' && (
                    <button className="btn" onClick={() => change(req.id, 'OPEN', done)} style={{ minHeight: 40, padding: '0 14px', borderRadius: 14, background: '#FFF1E0', color: '#C24D00', fontWeight: 800, fontSize: 13 }}>Открыть снова</button>
                  )}
                </>
              )} />
          ) : (
            <div style={{ color: '#6B6258', fontWeight: 700, fontSize: 14, padding: 20 }}>Выберите обращение слева.</div>
          )}
        </div>
      </div>
    </>
  );
}
