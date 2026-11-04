'use client';
import { useEffect, useState } from 'react';
import { Badge, Panel, TableWrap } from '@/components/admin/kit';
import { Spinner, toast } from '@/components/ui';
import { type LiveCourier, REASSIGNABLE_STATUSES, dispatchErr } from '@/features/admin/couriers';
import { STATUS_LABEL, timeHM } from '@/features/orders/status';
import { formatPhone } from '@/lib/phone';
import { sb } from '@/lib/supabase/client';
import type { OrderRow } from '@/types/catalog';

export function OnlineBadge({ online }: { online: boolean }) {
  return <Badge color={online ? '#2E8B3F' : '#8A7F73'}>{online ? 'На линии' : 'Не на линии'}</Badge>;
}

function orderNums(c: LiveCourier): string {
  return c.active.map((o) => `#TB-${o.order_no}`).join(', ');
}

/** Admin: every courier with load and last GPS time. */
export function CourierLivePanel({ couriers, ready }: { couriers: LiveCourier[]; ready: boolean }) {
  const online = couriers.filter((c) => c.is_online).length;
  return (
    <section aria-labelledby="couriers-live-h" style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 id="couriers-live-h" className="disp" style={{ fontSize: 20, fontWeight: 800 }}>Курьеры</h2>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#6B6258' }}>На линии: {online} из {couriers.length} · обновляется автоматически</span>
      </div>
      <TableWrap>
        <thead><tr><th>Курьер</th><th>Телефон</th><th>Статус</th><th>Активные заказы</th><th>Последний GPS</th></tr></thead>
        <tbody>
          {!ready && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 30 }}><Spinner dark /></td></tr>}
          {ready && !couriers.length && <tr><td colSpan={5} style={{ color: '#6B6258' }}>Курьеров пока нет — выдайте роль «Курьер» в разделе «Сотрудники и роли».</td></tr>}
          {couriers.map((c) => (
            <tr key={c.user_id}>
              <td><b>{c.display_name}</b>{!c.is_active && <div style={{ fontSize: 12, color: '#B3261E', fontWeight: 700 }}>отключён</div>}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{c.phone ? formatPhone(c.phone) : '—'}</td>
              <td><OnlineBadge online={c.is_online} /></td>
              <td>{c.active.length ? <><b>{c.active.length}</b> · {orderNums(c)}</> : <span style={{ color: '#6B6258' }}>свободен</span>}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {c.last_gps_at ? <>{timeHM(c.last_gps_at)}<span style={{ color: '#6B6258' }}> · {c.gps_age_min === 0 ? 'только что' : `${c.gps_age_min} мин назад`}</span></> : <span style={{ color: '#6B6258' }}>нет данных</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </section>
  );
}

/** Orders page (admin + moderator): collapsible list of online couriers and their load. */
export function CourierStrip({ couriers, ready }: { couriers: LiveCourier[]; ready: boolean }) {
  const [openStrip, setOpenStrip] = useState(false);
  const online = couriers.filter((c) => c.is_online && c.is_active);
  const free = online.filter((c) => !c.active.length).length;
  return (
    <Panel style={{ marginTop: 14, padding: '10px 16px' }}>
      <button className="btn" aria-expanded={openStrip} aria-controls="couriers-strip" onClick={() => setOpenStrip(!openStrip)}
        style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', fontWeight: 800, fontSize: 14 }}>
        <span style={{ flex: 1 }}>Курьеры на линии{ready ? `: ${online.length}` : ''}{ready && online.length > 0 ? ` · свободны: ${free}` : ''}</span>
        <span aria-hidden="true" style={{ fontSize: 12, color: '#6B6258' }}>{openStrip ? '▲' : '▼'}</span>
      </button>
      {openStrip && (
        <div id="couriers-strip" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, paddingBottom: 6 }}>
          {!ready && <Spinner dark />}
          {ready && !online.length && <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 700 }}>Сейчас никого нет на линии.</div>}
          {online.map((c) => (
            <div key={c.user_id} style={{ background: '#F3EADF', borderRadius: 14, padding: '8px 12px', fontSize: 13, fontWeight: 700 }}>
              <div style={{ fontWeight: 800 }}>{c.display_name}</div>
              <div style={{ color: c.active.length ? '#C24D00' : '#2E8B3F' }}>{c.active.length ? `${c.active.length} зак.: ${orderNums(c)}` : 'свободен'}</div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function PickModal({ order, couriers, busy, onPick, onClose }: { order: OrderRow; couriers: LiveCourier[]; busy: boolean; onPick: (id: string) => void; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const list = couriers.filter((c) => c.is_active).sort((a, b) => Number(b.is_online) - Number(a.is_online) || a.active.length - b.active.length);
  return (
    <div role="dialog" aria-modal="true" aria-label="Сменить курьера" style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(20,18,16,.45)' }} />
      <div style={{ position: 'relative', width: 'min(460px, 100%)', maxHeight: '85dvh', overflowY: 'auto', background: '#fff', borderRadius: 20, padding: 24, boxSizing: 'border-box' }}>
        <div className="disp" style={{ fontSize: 18, fontWeight: 800 }}>Сменить курьера</div>
        <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 700, marginTop: 6 }}>Заказ #TB-{order.order_no}. Выберите курьера — он сразу получит этот заказ.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {!list.length && <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 700 }}>Активных курьеров нет.</div>}
          {list.map((c) => (
            <button key={c.user_id} className="btn" disabled={busy || c.user_id === order.courier_id} onClick={() => onPick(c.user_id)}
              style={{ minHeight: 56, borderRadius: 14, background: '#F3EADF', padding: '8px 14px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, opacity: c.user_id === order.courier_id ? 0.5 : 1 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 800, fontSize: 14 }}>{c.display_name}{c.user_id === order.courier_id ? ' (сейчас)' : ''}</span>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#6B6258' }}>Активных заказов: {c.active.length}</span>
              </span>
              <OnlineBadge online={c.is_online} />
            </button>
          ))}
        </div>
        <button className="btn" onClick={onClose} style={{ width: '100%', height: 48, borderRadius: 24, background: '#F3EADF', fontWeight: 800, marginTop: 14 }}>Отмена</button>
      </div>
    </div>
  );
}

const act: React.CSSProperties = { minHeight: 44, padding: '0 16px', borderRadius: 14, fontWeight: 800, fontSize: 13 };

/** Order drawer: who delivers the order + change / auto-pick / release (back office). */
export function CourierSection({ order, couriers, onChanged }: { order: OrderRow; couriers: LiveCourier[]; onChanged: () => void }) {
  const [pick, setPick] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (order.mode !== 'DELIVERY') return null;
  const cur = order.courier_id ? couriers.find((c) => c.user_id === order.courier_id) ?? null : null;
  const canChange = REASSIGNABLE_STATUSES.includes(order.status);

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, okText: string) => {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) { toast(dispatchErr(error.message)); return false; }
    toast(okText);
    onChanged();
    return true;
  };

  const choose = async (courier: string) => {
    if (await run(() => sb().rpc('reassign_courier', { p_order: order.id, p_courier: courier }), 'Курьер изменён')) setPick(false);
  };
  const auto = async () => {
    await run(() => sb().rpc('reassign_courier', { p_order: order.id, p_courier: null }), 'Запущен авто-подбор курьера');
  };
  const release = async () => {
    if (await run(() => sb().rpc('release_courier', { p_order: order.id, p_reason: reason.trim() || null }), 'Курьер снят, идёт подбор другого')) {
      setReleasing(false); setReason('');
    }
  };

  return (
    <Panel style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 15 }}>Курьер</div>
      {order.courier_id ? (
        <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{cur?.display_name ?? 'Курьер'}</div>
            {cur?.phone && <a href={`tel:${cur.phone}`} style={{ color: '#C24D00', fontWeight: 700, fontSize: 13 }}>{formatPhone(cur.phone)}</a>}
            {cur && <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 700, marginTop: 4 }}>Активных заказов: {cur.active.length}{cur.active.length ? ` · ${orderNums(cur)}` : ''}</div>}
          </div>
          {cur && <OnlineBadge online={cur.is_online} />}
        </div>
      ) : (
        <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: '#6B6258' }}>
          {canChange ? 'Курьер ещё не найден — система ищет свободного.' : order.status === 'PENDING' ? 'Курьер назначится автоматически, когда заказ начнёт готовиться.' : 'Курьер не назначен.'}
        </div>
      )}

      {canChange && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button className="btn" disabled={busy} onClick={() => setPick(true)} style={{ ...act, background: '#141210', color: '#fff' }}>Сменить курьера</button>
            <button className="btn" disabled={busy} onClick={auto} style={{ ...act, background: '#FF6A0A', color: '#fff' }}>{busy ? <Spinner /> : 'Авто-подбор'}</button>
            {order.courier_id && !releasing && <button className="btn" disabled={busy} onClick={() => setReleasing(true)} style={{ ...act, background: '#F3EADF', color: '#B3261E' }}>Снять курьера</button>}
          </div>
          {releasing && (
            <div style={{ marginTop: 10, background: '#FFF8F0', borderRadius: 14, padding: 12 }}>
              <label htmlFor="release-reason" style={{ fontSize: 12, fontWeight: 800, color: '#6B6258' }}>ПРИЧИНА (необязательно)</label>
              <input id="release-reason" className="field" value={reason} onChange={(e) => setReason(e.target.value.slice(0, 200))} placeholder="Например: курьер не вышел на связь" style={{ marginTop: 6 }} />
              <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 6 }}>Курьер будет снят, система подберёт другого. Запись попадёт в историю заказа.</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn" disabled={busy} onClick={() => { setReleasing(false); setReason(''); }} style={{ ...act, background: '#F3EADF' }}>Отмена</button>
                <button className="btn" disabled={busy} onClick={release} style={{ ...act, background: '#B3261E', color: '#fff' }}>{busy ? <Spinner /> : 'Снять курьера'}</button>
              </div>
            </div>
          )}
          <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 8 }}>
            Статус заказа: {STATUS_LABEL[order.status]}. Курьер забирает заказ сам, когда он готов.
          </div>
        </>
      )}
      {pick && <PickModal order={order} couriers={couriers} busy={busy} onPick={choose} onClose={() => setPick(false)} />}
    </Panel>
  );
}
