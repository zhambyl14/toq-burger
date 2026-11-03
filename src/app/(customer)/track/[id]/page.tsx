'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import Map from '@/components/maps/Map';
import { useCatalog } from '@/components/CatalogProvider';
import { toast } from '@/components/ui';
import { meatName } from '@/features/catalog/hooks';
import { unitPrice } from '@/features/cart/pricing';
import { useApp } from '@/stores/app';
import { CUSTOMER_STEPS, PICKUP_STEPS, stepIndex } from '@/features/orders/status';
import { useSession } from '@/hooks/useSession';
import { fmt } from '@/lib/money';
import { sb } from '@/lib/supabase/client';
import type { OrderRow } from '@/types/catalog';

const ICONS: Record<string, React.ReactNode> = {
  check: <path d="m5 12 5 5 9-10" />,
  kitchen: <><path d="M4 11a8 7 0 0 1 16 0z" /><path d="M3 15h18" /><path d="M5 18.5h14a3 3 0 0 1-3 2.5H8a3 3 0 0 1-3-2.5z" /></>,
  fire: <path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  bag: <><path d="M5 8h14l-1 12H6z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
  bike: <><circle cx="6" cy="17" r="3.5" /><circle cx="18" cy="17" r="3.5" /><path d="M6 17l4-8h5l3 8M10 9 8 6H6" /></>,
  flag: <path d="M6 21V4M6 5h12l-2 4 2 4H6" />,
};

function iconFor(stepLabel: string): string {
  if (stepLabel === 'Заказ принят') return 'check';
  if (stepLabel === 'Передан на кухню') return 'kitchen';
  if (stepLabel === 'Готовится') return 'fire';
  if (stepLabel === 'Ожидает курьера') return 'clock';
  if (stepLabel === 'Готов к выдаче') return 'bag';
  if (stepLabel === 'Курьер забрал заказ' || stepLabel === 'Курьер в пути') return 'bike';
  return 'flag';
}

function Icon({ name, size = 22, color = 'currentColor' }: { name: string; size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>;
}

export default function TrackPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const session = useSession();
  const { branches, products, extras } = useCatalog();
  const addToCart = useApp((st) => st.add);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [missing, setMissing] = useState(false);
  const [courierPos, setCourier] = useState<{ lat: number; lon: number } | null>(null);
  const [courierName, setCourierName] = useState<string | null>(null);

  useEffect(() => {
    if (session.ready && !session.user) router.replace(`/auth?next=/track/${id}`);
  }, [session.ready, session.user, id, router]);

  // initial load + realtime status updates
  useEffect(() => {
    if (!session.user) return;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      const { data, error } = await sb().from('orders').select('*, order_items(*)').eq('id', id).maybeSingle();
      if (!alive) return;
      if (error) {
        if (retry) clearTimeout(retry);
        retry = setTimeout(load, 3000);
        return;
      }
      if (!data) setMissing(true); else { setMissing(false); setOrder(data as OrderRow); }
    };
    load();
    const ch = sb().channel('order-' + id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
        (p) => setOrder((o) => (o ? { ...o, ...(p.new as OrderRow) } : o)))
      .subscribe();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; if (retry) clearTimeout(retry); sb().removeChannel(ch); document.removeEventListener('visibilitychange', onVis); };
  }, [id, session.user]);

  // courier GPS only during an active delivery (RLS enforces the same rule)
  const live = order?.courier_id && (order.status === 'PICKED_UP' || order.status === 'ON_THE_WAY');
  const courierId = order?.courier_id;
  useEffect(() => {
    if (!courierId) return;
    sb().from('couriers').select('display_name').eq('user_id', courierId).maybeSingle().then(({ data }) => setCourierName(data?.display_name ?? null));
  }, [courierId]);
  useEffect(() => {
    if (!live || !courierId) return;
    sb().from('courier_locations').select('lat,lon').eq('courier_id', courierId).order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => data && setCourier({ lat: data.lat, lon: data.lon }));
    const ch = sb().channel('courier-' + courierId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'courier_locations', filter: `courier_id=eq.${courierId}` },
        (p) => setCourier({ lat: (p.new as { lat: number }).lat, lon: (p.new as { lon: number }).lon }))
      .subscribe();
    return () => { sb().removeChannel(ch); };
  }, [live, courierId]);

  const courier = live ? courierPos : null;
  const branch = branches.find((b) => b.id === order?.branch_id);
  const markers = useMemo(() => (branch?.lat != null ? [{ id: branch.id, lat: branch.lat, lon: branch.lon!, label: 'Филиал', active: false }] : []), [branch]);
  const oLat = order?.lat ?? null, oLon = order?.lon ?? null;
  const dest = useMemo(() => (oLat != null && oLon != null ? { lat: oLat, lon: oLon } : null), [oLat, oLon]);
  const route = useMemo(() => (branch?.lat != null && dest ? [{ lat: branch.lat, lon: branch.lon! }, dest] as [{ lat: number; lon: number }, { lat: number; lon: number }] : null), [branch, dest]);

  if (missing) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ width: 88, height: 88, borderRadius: 28, background: '#FFF1E0', color: '#C24D00', margin: '40px auto 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="bag" size={40} /></div>
        <div className="disp" style={{ fontSize: 20, fontWeight: 800, marginTop: 20 }}>Заказ не найден</div>
        <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 6 }}>Возможно, ссылка устарела. Все ваши заказы доступны в профиле.</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
          <Link href="/profile" className="btn" style={{ display: 'inline-flex', minHeight: 52, padding: '0 22px', borderRadius: 26, alignItems: 'center', textDecoration: 'none', background: '#fff', fontWeight: 800 }}>Мои заказы</Link>
          <Link href="/" className="btn primary" style={{ display: 'inline-flex', minHeight: 52, padding: '0 22px', borderRadius: 26, alignItems: 'center', textDecoration: 'none' }}>На главную</Link>
        </div>
      </div>
    );
  }
  if (!order) {
    return (
      <div aria-busy="true" aria-label="Загрузка заказа">
        <div style={{ background: '#141210', height: 150, borderRadius: '0 0 32px 32px' }} />
        <div style={{ padding: 16 }}>
          {[190, 90, 140].map((h, i) => <div key={i} style={{ height: h, borderRadius: 22, background: '#fff', marginTop: i ? 14 : 0, animation: 'fade .9s ease-in-out infinite alternate' }} />)}
        </div>
      </div>
    );
  }

  const pickup = order.mode === 'PICKUP';
  const steps = pickup ? PICKUP_STEPS : CUSTOMER_STEPS;
  const st = stepIndex(order.status, order.mode);
  const cancelled = order.status === 'CANCELLED';
  const delivered = order.status === 'DELIVERED';
  const label = cancelled ? 'Заказ отменён' : steps[st];

  const cancel = async () => {
    if (!confirm('Отменить заказ?')) return;
    const { error } = await sb().rpc('transition_order', { p_order: order.id, p_to: 'CANCELLED', p_note: 'Отменён клиентом' });
    toast(error ? 'Заказ уже принят кухней — отмена через поддержку' : 'Заказ отменён');
  };

  const repeat = () => {
    let added = 0, skipped = 0;
    for (const it of order.order_items ?? []) {
      const p = products.find((x) => x.name === it.product_name);
      if (!p) { skipped++; continue; }
      const exIds = it.extras.map((e) => extras.find((x) => x.id === e.id)?.id ?? extras.find((x) => x.name === e.name)?.id).filter((x): x is string => !!x);
      if (exIds.length !== it.extras.length || unitPrice(p, it.meat, exIds, extras) == null) { skipped++; continue; }
      addToCart({ productId: p.id, meat: it.meat, qty: it.quantity, extraIds: exIds });
      added++;
    }
    if (!added) { toast('Эти позиции сейчас недоступны'); return; }
    toast(skipped ? `Добавлено в корзину. Недоступно позиций: ${skipped}` : 'Заказ добавлен в корзину');
    router.push('/cart');
  };

  return (
    <div className="scr-in" style={{ paddingBottom: 16 }}>
      <div style={{ background: '#141210', color: '#fff', padding: '16px 16px 26px', borderRadius: '0 0 32px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 'none', width: 56, height: 56, borderRadius: 20, background: cancelled ? '#B3261E' : delivered ? '#2E8B3F' : '#FF6A0A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: cancelled || delivered ? 'none' : 'ping 1.4s infinite' }}>
            <Icon name={cancelled ? 'bag' : iconFor(steps[st])} size={28} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#FF6A0A', letterSpacing: '.1em' }}>ЗАКАЗ #TB-{order.order_no}</div>
            <h1 className="disp" style={{ fontSize: 22, fontWeight: 800, marginTop: 4, lineHeight: 1.1 }} aria-live="polite">{label}</h1>
          </div>
        </div>
        <div style={{ fontSize: 13, opacity: 0.75, marginTop: 6, fontWeight: 600 }}>Филиал: {branch?.name ?? '—'} · {pickup ? 'самовывоз' : 'доставка'}</div>
        <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,.18)', marginTop: 16, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${cancelled ? 0 : Math.round((st / (steps.length - 1)) * 100)}%`, background: '#FF6A0A', borderRadius: 4, transition: 'width .8s ease' }} />
        </div>
      </div>
      <div style={{ padding: 16 }}>
        {!cancelled && (
          <div className="card" style={{ padding: 18 }}>
            {steps.map((s, i) => {
              const done = i < st || delivered, act = i === st && !delivered;
              const last = i === steps.length - 1;
              return (
                <div key={s} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', paddingBottom: last ? 0 : 18, position: 'relative' }}>
                  <div style={{ flex: 'none', width: 24, height: 24, borderRadius: '50%', background: done ? '#2E8B3F' : act ? '#FF6A0A' : '#E5DACB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 800, animation: act ? 'ping 1.4s infinite' : 'none' }}><Icon name={done ? 'check' : iconFor(s)} size={13} color="#fff" /></div>
                  {!last && <div style={{ position: 'absolute', left: 11, top: 26, bottom: -2, width: 2, background: done ? '#2E8B3F' : '#E5DACB' }} />}
                  <div style={{ fontWeight: act ? 800 : 700, fontSize: 14, color: done || act ? '#141210' : '#8A7F73', paddingTop: 2 }}>{s}</div>
                </div>
              );
            })}
          </div>
        )}

        {order.courier_id && !pickup && (
          <div className="card" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#FF6A0A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>{(courierName ?? 'К')[0]}</div>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 15 }}>{courierName ?? 'Курьер'}</div><div style={{ fontSize: 12, color: '#6B6258', fontWeight: 700 }}>{live ? (courier ? 'Местоположение обновляется' : 'Ожидаем GPS курьера') : 'Назначен на ваш заказ'}</div></div>
          </div>
        )}

        {!pickup && dest && (
          <div style={{ marginTop: 14, height: 280, borderRadius: 22, overflow: 'hidden' }}>
            <Map branches={markers} pin={dest} courier={courier} route={route} height="100%" center={dest} zoom={13} />
          </div>
        )}

        <div className="card" style={{ marginTop: 14, fontSize: 14, fontWeight: 700 }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>Состав заказа</div>
          {order.order_items?.map((it) => (
            <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', gap: 8 }}>
              <span>{it.product_name}{it.meat !== 'one' ? ' · ' + meatName(it.meat) : ''}{it.extras.length ? ' + ' + it.extras.map((e) => e.name).join(', ') : ''} × {it.quantity}</span>
              <span style={{ whiteSpace: 'nowrap' }}>{fmt(it.line_total_kzt)}</span>
            </div>
          ))}
          {order.discount_kzt > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2E8B3F', padding: '4px 0' }}><span>Скидка</span><span>−{fmt(order.discount_kzt)}</span></div>}
          {!pickup && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><span>Доставка</span><span>{fmt(order.delivery_fee_kzt)}</span></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px dashed #F3EADF', marginTop: 8, paddingTop: 10, fontSize: 17, fontWeight: 800 }}><span>Итого</span><span>{fmt(order.total_kzt)}</span></div>
          {order.address_text && <div style={{ fontSize: 12, color: '#6B6258', marginTop: 8 }}>{order.address_text}{order.apartment ? ', кв. ' + order.apartment : ''}</div>}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          {order.status === 'PENDING' && <button className="btn" onClick={cancel} style={{ flex: 1, minHeight: 52, borderRadius: 18, background: '#F3EADF', color: '#B3261E', fontWeight: 800, fontSize: 13 }}>Отменить заказ</button>}
          <Link href={`/profile?tab=support&order=${order.id}`} className="btn" style={{ flex: 1, minHeight: 52, borderRadius: 18, background: '#fff', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: '#141210', boxShadow: '0 8px 22px rgba(120,60,0,.07)' }}>Вопрос по заказу</Link>
        </div>
        {delivered && <button className="btn primary" onClick={repeat} style={{ marginTop: 12, width: '100%', height: 56, borderRadius: 28, fontSize: 16 }}>Повторить заказ</button>}
        {(delivered || cancelled) && <Link href="/" className="btn" style={{ marginTop: 10, width: '100%', minHeight: 52, borderRadius: 26, fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', background: '#fff', color: '#141210', boxSizing: 'border-box' }}>{delivered ? 'Приятного аппетита! На главную' : 'На главную'}</Link>}
      </div>
    </div>
  );
}
