'use client';
import { useState } from 'react';
import { NewThreadForm } from './NewThreadForm';
import { ThreadList } from './ThreadList';
import { ThreadView } from './ThreadView';
import { pal, type SupportKind } from './types';
import { useThreads } from './useSupport';

const ALL = { status: 'all', kind: 'all' } as const;

/** Requester-side support: my threads, open thread, new thread. Used by customers and couriers. */
export function SupportCenter({ kind, dark = false, initialOrderId = null }: { kind: SupportKind; dark?: boolean; initialOrderId?: string | null }) {
  const c = pal(dark);
  const [creating, setCreating] = useState(!!initialOrderId);
  const [selected, setSelected] = useState<string | null>(null);
  const { rows, orderNos, reload } = useThreads('mine', ALL);

  if (creating) {
    return (
      <NewThreadForm kind={kind} dark={dark} initialOrderId={initialOrderId}
        onCancel={() => setCreating(false)}
        onCreated={(id) => { setCreating(false); setSelected(id); reload(); }} />
    );
  }
  if (selected) {
    return <ThreadView requestId={selected} dark={dark} onBack={() => setSelected(null)} onActivity={reload} />;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button className="btn primary" onClick={() => setCreating(true)} style={{ height: 48, borderRadius: 24 }}>Новое обращение</button>
      <div style={{ fontSize: 12, fontWeight: 800, color: c.muted }}>МОИ ОБРАЩЕНИЯ</div>
      <ThreadList rows={rows} onSelect={setSelected} dark={dark} orderNos={orderNos} empty="Обращений пока нет." />
    </div>
  );
}
