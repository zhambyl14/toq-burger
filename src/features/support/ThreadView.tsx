'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Spinner, toast } from '@/components/ui';
import { dateShort, STATUS_COLOR as ORDER_COLOR, STATUS_LABEL as ORDER_LABEL, timeHM } from '@/features/orders/status';
import { KindBadge, StatusBadge } from './Badges';
import { fmt } from '@/lib/money';
import { pal, ROLE_LABEL, type OrderInfo, type OrderOption, type Pal, type SupportKind, type SupportReq } from './types';
import { findOrderByNo, useMyOrders, useOrderInfos, useThread } from './useSupport';
import type { OrderStatus } from '@/types/catalog';

interface Props {
  requestId: string;
  /** Viewer is admin / moderator (sees requester name on the left, can reply to closed threads). */
  staff?: boolean;
  dark?: boolean;
  bodyHeight?: string;
  onBack?: () => void;
  /** Called after the viewer sends a message or changes the thread. */
  onActivity?: () => void;
  /** Extra controls rendered in the header (e.g. status buttons). `done` refreshes the thread and the list. */
  actions?: (ctx: { req: SupportReq; done: () => void }) => React.ReactNode;
}

interface BubbleData { key: string; mine: boolean; name: string; role: string | null; body: string; at: string; orderId: string | null }

export function ThreadView({ requestId, staff = false, dark = false, bodyHeight, onBack, onActivity, actions }: Props) {
  const c = pal(dark);
  const { loading, req, msgs, orderNo, send, reload, uid } = useThread(requestId);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const count = msgs.length;
  const [picking, setPicking] = useState(false);
  const infos = useOrderInfos(msgs.map((m) => m.order_id).filter((x): x is string => !!x));

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [count, loading]);

  const submit = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const ok = await send(body.slice(0, 2000));
    setSending(false);
    if (ok) {
      setText('');
      onActivity?.();
    }
  };
  const attach = async (o: OrderOption) => {
    if (sending) return;
    setSending(true);
    const ok = await send(text.trim().slice(0, 2000) || `Заказ #TB-${o.order_no}`, o.id);
    setSending(false);
    if (ok) {
      setText('');
      setPicking(false);
      onActivity?.();
    } else toast('Не удалось прикрепить заказ');
  };
  const done = () => {
    reload();
    onActivity?.();
  };

  if (loading) return <div style={{ padding: 30, textAlign: 'center' }}><Spinner dark={!dark} /></div>;
  if (!req) {
    return (
      <div style={{ padding: 20, color: c.muted, fontWeight: 700, fontSize: 14 }}>
        Обращение не найдено.
        {onBack && <div><button className="btn" onClick={onBack} style={{ marginTop: 10, minHeight: 44, padding: '0 16px', borderRadius: 14, background: c.chip, color: c.chipText, fontWeight: 800 }}>← Назад</button></div>}
      </div>
    );
  }

  const first: BubbleData = {
    key: 'first', mine: req.user_id === uid, name: req.requester_name ?? 'Клиент',
    role: req.kind === 'COURIER' ? 'COURIER' : 'CUSTOMER', body: req.message, at: req.created_at, orderId: null,
  };
  const bubbles: BubbleData[] = [first, ...msgs.map((m) => ({
    key: String(m.id), mine: m.author_id === uid, name: m.author_name ?? 'Сотрудник', role: m.author_role, body: m.body, at: m.created_at, orderId: m.order_id,
  }))];
  const closedForUser = req.status === 'CLOSED' && !staff;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, color: c.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {onBack && <button className="btn" onClick={onBack} aria-label="Назад к списку" style={{ width: 44, height: 44, borderRadius: '50%', background: c.chip, color: c.chipText, fontWeight: 800, fontSize: 18 }}>←</button>}
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{staff ? (req.requester_name ?? 'Без имени') : 'Обращение'}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: c.muted, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
            <span>{dateShort(req.created_at)} {timeHM(req.created_at)}</span>
            {req.order_id && (staff && orderNo != null
              ? <Link href={`/admin/orders?open=${req.order_id}`} style={{ fontWeight: 800, color: dark ? '#FF6A0A' : '#C24D00' }}>Заказ #TB-{orderNo}</Link>
              : <span>Заказ {orderNo != null ? `#TB-${orderNo}` : ''}</span>)}
          </div>
        </div>
        {staff && <KindBadge kind={req.kind} />}
        <StatusBadge status={req.status} />
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions({ req, done })}</div>}

      <div role="log" aria-live="polite" style={{ background: dark ? '#141210' : '#FBF6EE', borderRadius: 18, padding: 12, overflowY: 'auto', height: bodyHeight ?? 'min(55vh, 460px)', minHeight: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {bubbles.map((b) => {
          const label = `${b.name}${b.role ? ' · ' + (ROLE_LABEL[b.role] ?? b.role) : ''}`;
          return (
            <div key={b.key} style={{ alignSelf: b.mine ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
              {!b.mine && <div style={{ fontSize: 11, fontWeight: 800, color: c.muted, margin: '0 6px 2px' }}>{label}</div>}
              {b.orderId && <OrderCard info={infos[b.orderId]} id={b.orderId} staff={staff} c={c} dark={dark} />}
              <div style={{ background: b.mine ? c.mine : c.other, color: b.mine ? c.mineText : c.otherText, borderRadius: 16, padding: '9px 13px', fontSize: 14, fontWeight: 600, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{b.body}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: c.muted, margin: '2px 6px 0', textAlign: b.mine ? 'right' : 'left' }}>{b.mine ? `${label} · ` : ''}{timeHM(b.at)}</div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {closedForUser ? (
        <div style={{ fontSize: 13, fontWeight: 700, color: c.muted, padding: '4px 4px' }}>Обращение закрыто. Если вопрос остался, создайте новое обращение.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {picking && <OrderPicker kind={req.kind} staff={staff} c={c} dark={dark} busy={sending} onPick={attach} onClose={() => setPicking(false)} />}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder="Ваше сообщение" aria-label="Сообщение"
              className="field" style={{ height: 'auto', padding: 12, resize: 'vertical', background: dark ? '#3A332D' : '#fff', color: dark ? '#fff' : '#141210', borderColor: dark ? '#3A332D' : undefined }} />
            <button className="btn primary" onClick={submit} disabled={sending || !text.trim()} style={{ height: 48, padding: '0 18px', borderRadius: 24, flex: 'none', opacity: !text.trim() ? 0.6 : 1 }}>{sending ? <Spinner /> : 'Отправить'}</button>
          </div>
          <button className="btn" onClick={() => setPicking((v) => !v)} aria-expanded={picking} style={{ alignSelf: 'flex-start', minHeight: 44, padding: '0 16px', borderRadius: 22, background: c.chip, color: c.chipText, fontWeight: 800, fontSize: 13 }}>
            {picking ? 'Скрыть заказы' : '🧾 Прикрепить заказ'}
          </button>
        </div>
      )}
    </div>
  );
}

function OrderCard({ info, id, staff, c, dark }: { info?: OrderInfo; id: string; staff: boolean; c: Pal; dark: boolean }) {
  const href = staff ? `/admin/orders?open=${id}` : `/track/${id}`;
  const st = info?.status as OrderStatus | undefined;
  return (
    <Link href={href} aria-label={info ? `Открыть заказ ${info.order_no}` : 'Открыть заказ'}
      style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: c.text, background: dark ? '#241F1B' : '#fff', border: `2px solid ${dark ? '#FF6A0A' : '#FFD9B8'}`, borderRadius: 16, padding: '9px 12px', marginBottom: 4, minHeight: 44 }}>
      <span aria-hidden style={{ fontSize: 20 }}>🧾</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 800, fontSize: 14 }}>{info ? `Заказ #TB-${info.order_no}` : 'Заказ'}</span>
        {info && (
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: c.muted }}>
            {dateShort(info.created_at)}{info.total_kzt != null ? ` · ${fmt(info.total_kzt)}` : ''}
            {st && ORDER_LABEL[st] && <> · <span style={{ color: ORDER_COLOR[st] }}>{ORDER_LABEL[st]}</span></>}
          </span>
        )}
      </span>
      <span aria-hidden style={{ color: c.muted, fontWeight: 800 }}>→</span>
    </Link>
  );
}

function OrderPicker({ kind, staff, c, dark, busy, onPick, onClose }: { kind: SupportKind; staff: boolean; c: Pal; dark: boolean; busy: boolean; onPick: (o: OrderOption) => void; onClose: () => void }) {
  const orders = useMyOrders(kind);
  const [num, setNum] = useState('');
  const lookup = async () => {
    const n = parseInt(num.replace(/\D/g, ''), 10);
    if (!n) { toast('Введите номер заказа'); return; }
    const o = await findOrderByNo(n);
    if (o) onPick(o);
  };
  return (
    <div style={{ background: dark ? '#141210' : '#FBF6EE', borderRadius: 16, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, fontSize: 12, fontWeight: 800, color: c.muted }}>{staff ? 'ПРИКРЕПИТЬ ЗАКАЗ' : 'ВАШИ ПОСЛЕДНИЕ ЗАКАЗЫ'}</div>
        <button className="btn" onClick={onClose} aria-label="Закрыть выбор заказа" style={{ width: 44, height: 44, color: c.muted }}>✕</button>
      </div>
      {staff && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="field" value={num} onChange={(e) => setNum(e.target.value)} inputMode="numeric" placeholder="#TB-номер" aria-label="Номер заказа" style={{ background: dark ? '#3A332D' : '#fff', color: dark ? '#fff' : '#141210' }} />
          <button className="btn primary" onClick={lookup} disabled={busy} style={{ height: 48, padding: '0 16px', borderRadius: 24 }}>Найти</button>
        </div>
      )}
      {!staff && !orders.length && <div style={{ fontSize: 13, fontWeight: 700, color: c.muted }}>Заказов пока нет.</div>}
      {!staff && orders.map((o) => (
        <button key={o.id} className="btn" disabled={busy} onClick={() => onPick(o)} style={{ minHeight: 44, borderRadius: 14, padding: '0 14px', background: c.card, color: c.text, textAlign: 'left', fontWeight: 800, fontSize: 14 }}>
          #TB-{o.order_no} <span style={{ color: c.muted, fontWeight: 700, fontSize: 12 }}>· {dateShort(o.created_at)}</span>
        </button>
      ))}
    </div>
  );
}
