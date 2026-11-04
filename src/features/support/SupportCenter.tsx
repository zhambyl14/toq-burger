'use client';
import { useState } from 'react';
import { BoltMark } from '@/components/customer/BoltMark';
import { useLang } from '@/i18n/LangProvider';
import { NewThreadForm } from './NewThreadForm';
import { ThreadList } from './ThreadList';
import { ThreadView } from './ThreadView';
import { pal, type SupportKind } from './types';
import { useThreads } from './useSupport';
import '@/styles/flow.css';

const ALL = { status: 'all', kind: 'all' } as const;

/**
 * Requester-side support: my threads, open thread, new thread. Used by customers and couriers.
 * wide: from 900px show the thread list and the conversation side by side (customer profile); below that
 * (and when not wide) it is the single-pane flow list -> thread / new thread.
 */
export function SupportCenter({ kind, dark = false, initialOrderId = null, wide = false }: { kind: SupportKind; dark?: boolean; initialOrderId?: string | null; wide?: boolean }) {
  const c = pal(dark);
  const { t } = useLang();
  const [creating, setCreating] = useState(!!initialOrderId);
  const [selected, setSelected] = useState<string | null>(null);
  const { rows, orderNos, reload } = useThreads('mine', ALL);

  const form = (
    <NewThreadForm kind={kind} dark={dark} initialOrderId={initialOrderId}
      onCancel={() => setCreating(false)}
      onCreated={(id) => { setCreating(false); setSelected(id); reload(); }} />
  );
  const thread = selected ? <ThreadView requestId={selected} dark={dark} onBack={() => setSelected(null)} onActivity={reload} /> : null;
  const list = (
    <>
      <button className="btn primary" onClick={() => { setSelected(null); setCreating(true); }} style={{ height: 48, borderRadius: 24 }}>{t('Новое обращение', 'Жаңа өтініш')}</button>
      <div className="fl-cap" style={{ color: c.muted }}>{t('МОИ ОБРАЩЕНИЯ', 'МЕНІҢ ӨТІНІШТЕРІМ')}</div>
      <ThreadList rows={rows} selectedId={wide ? selected : null} onSelect={(id) => { setCreating(false); setSelected(id); }} dark={dark} orderNos={orderNos} empty={t('Обращений пока нет.', 'Өтініштер әзірге жоқ.')} />
    </>
  );

  if (!wide) {
    if (creating) return form;
    if (selected) return thread;
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{list}</div>;
  }

  const paneOpen = creating || !!selected;
  return (
    <div className="fl-sup fl-sup--wide">
      <div className={'fl-sup__list' + (paneOpen ? ' fl-sup-hide-m' : '')}>{list}</div>
      <div className={'fl-sup__pane' + (paneOpen ? '' : ' fl-sup-hide-m')}>
        {creating ? form : thread}
        {!paneOpen && (
          <div className="fl-sup__empty" style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 320, borderRadius: 24, border: '2px dashed #FFD9B8', textAlign: 'center', padding: 24 }}>
            <BoltMark size={56} />
            <div className="disp" style={{ fontSize: 16, fontWeight: 800 }}>{t('Выберите обращение', 'Өтінішті таңдаңыз')}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: c.muted }}>{t('или создайте новое — мы ответим здесь.', 'немесе жаңасын жасаңыз — жауапты осы жерде береміз.')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
