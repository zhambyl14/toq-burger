'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import Map from '@/components/maps/Map';
import { useCatalog } from '@/components/CatalogProvider';
import { toast } from '@/components/ui';
import { unitPrice } from '@/features/cart/pricing';
import { BoltMark } from '@/components/customer/BoltMark';
import { PaymentPanel } from '@/components/customer/PaymentPanel';
import { PricePill } from '@/components/customer/PricePill';
import { PAY_STATE_LABEL } from '@/features/payments/settings';
import { useLang } from '@/i18n/LangProvider';
import { useApp } from '@/stores/app';
import { courierNoteL, CUSTOMER_STEPS, PICKUP_STEPS, stepIndex, stepLabels } from '@/features/orders/status';
import { useSession } from '@/hooks/useSession';
import { fmt } from '@/lib/money';
import { sb } from '@/lib/supabase/client';
import type { Meat, OrderRow } from '@/types/catalog';
import '@/styles/flow.css';

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
  const { t, tx, lang } = useLang();
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
      await sb().rpc('expire_unpaid_orders');
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
  const markers = useMemo(() => (branch?.lat != null ? [{ id: branch.id, lat: branch.lat, lon: branch.lon!, label: t('Филиал', 'Филиал'), active: false }] : []), [branch, t]);
  const oLat = order?.lat ?? null, oLon = order?.lon ?? null;
  const dest = useMemo(() => (oLat != null && oLon != null ? { lat: oLat, lon: oLon } : null), [oLat, oLon]);
  const route = useMemo(() => (branch?.lat != null && dest ? [{ lat: branch.lat, lon: branch.lon! }, dest] as [{ lat: number; lon: number }, { lat: number; lon: number }] : null), [branch, dest]);

  if (missing) {
    return (
      <div className="fl-page" style={{ textAlign: 'center' }}>
        <div style={{ width: 88, height: 88, borderRadius: 28, background: '#FFF1E0', color: '#C24D00', margin: '40px auto 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="bag" size={40} /></div>
        <div className="disp" style={{ fontSize: 20, fontWeight: 800, marginTop: 20 }}>{t('Заказ не найден', 'Тапсырыс табылмады')}</div>
        <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 6 }}>{t('Возможно, ссылка устарела. Все ваши заказы доступны в профиле.', 'Сілтеме ескірген болуы мүмкін. Барлық тапсырыстарыңыз профильде.')}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
          <Link href="/profile" className="btn" style={{ display: 'inline-flex', minHeight: 52, padding: '0 22px', borderRadius: 26, alignItems: 'center', textDecoration: 'none', background: '#fff', fontWeight: 800 }}>{t('Мои заказы', 'Менің тапсырыстарым')}</Link>
          <Link href="/" className="btn primary" style={{ display: 'inline-flex', minHeight: 52, padding: '0 22px', borderRadius: 26, alignItems: 'center', textDecoration: 'none' }}>{t('На главную', 'Басты бетке')}</Link>
        </div>
      </div>
    );
  }
  if (!order) {
    return (
      <div aria-busy="true" aria-label={t('Загрузка заказа', 'Тапсырыс жүктелуде')}>
        <div className="fl-trk__head" style={{ height: 150 }} />
        <div className="fl-trk">
          {[190, 90, 140].map((h, i) => <div key={i} style={{ height: h, borderRadius: 22, background: '#fff', animation: 'fade .9s ease-in-out infinite alternate' }} />)}
        </div>
      </div>
    );
  }

  const pickup = order.mode === 'PICKUP';
  const stepsRu = pickup ? PICKUP_STEPS : CUSTOMER_STEPS; // icon lookup keys
  const steps = stepLabels(order.mode, lang);
  const st = stepIndex(order.status, order.mode);
  const cancelled = order.status === 'CANCELLED';
  const delivered = order.status === 'DELIVERED';
  const unpaid = order.payment_method === 'KASPI_QR' && order.status === 'PENDING' && order.payment_state !== 'CONFIRMED' && order.payment_state !== 'NOT_REQUIRED';
  const label = cancelled ? t('Заказ отменён', 'Тапсырыс бас тартылды') : unpaid ? tx(...PAY_STATE_LABEL[order.payment_state]) : steps[st];
  const note = cancelled ? null : courierNoteL(order.status, order.mode, !!order.courier_id, lang);
  const meatL = (m: Meat) => (m === 'beef' ? t('Говядина', 'Сиыр еті') : m === 'chicken' ? t('Курица', 'Тауық еті') : '');
  const itemName = (nm: string) => { const p = products.find((x) => x.name === nm); return p ? tx(p.name, p.nameKk) : nm; };
  const extraName = (e: { id: string; name: string }) => { const x = extras.find((y) => y.id === e.id); return x ? tx(x.name, x.nameKk) : e.name; };

  const cancel = async () => {
    if (!confirm(t('Отменить заказ?', 'Тапсырыстан бас тартасыз ба?'))) return;
    const { error } = await sb().rpc('transition_order', { p_order: order.id, p_to: 'CANCELLED', p_note: 'Отменён клиентом' });
    toast(error ? t('Заказ уже принят кухней — отмена через поддержку', 'Тапсырыс асханада қабылданды — бас тарту қолдау қызметі арқылы') : t('Заказ отменён', 'Тапсырыс бас тартылды'));
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
    if (!added) { toast(t('Эти позиции сейчас недоступны', 'Бұл позициялар қазір қолжетімсіз')); return; }
    toast(skipped ? `${t('Добавлено в корзину. Недоступно позиций:', 'Себетке қосылды. Қолжетімсіз позициялар:')} ${skipped}` : t('Заказ добавлен в корзину', 'Тапсырыс себетке қосылды'));
    router.push('/cart');
  };

  return (
    <div className="scr-in" style={{ paddingBottom: 16 }}>
      <div className="fl-trk__head">
        <div className="fl-trk__bolt" aria-hidden="true"><BoltMark size={170} rotate={14} /></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
          <div className="fl-trk__ico" style={{ background: cancelled ? '#B3261E' : delivered ? '#2E8B3F' : '#FF6A0A', animation: cancelled || delivered ? 'none' : 'ping 1.4s infinite' }}>
            <Icon name={cancelled ? 'bag' : iconFor(stepsRu[st])} size={28} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="fl-trk__no">{t('ЗАКАЗ', 'ТАПСЫРЫС')} #TB-{order.order_no}</div>
            <h1 className="disp fl-trk__label" aria-live="polite">{label}</h1>
          </div>
        </div>
        <div style={{ fontSize: 13, opacity: 0.75, marginTop: 6, fontWeight: 600, position: 'relative' }}>{t('Филиал', 'Филиал')}: {branch?.name ?? '—'} · {pickup ? t('самовывоз', 'өзі алып кету') : t('доставка', 'жеткізу')}</div>
        <div className="fl-bolts" role="progressbar" aria-label={t('Ход выполнения заказа', 'Тапсырыстың орындалу барысы')} aria-valuemin={0} aria-valuemax={steps.length - 1} aria-valuenow={cancelled ? 0 : st} style={{ position: 'relative' }}>
          {steps.map((s, i) => <i key={s} className={!cancelled && (i <= st || delivered) ? 'on' : ''} />)}
        </div>
      </div>

      <div className="fl-trk">
        <div className="fl-trk__left">
          {session.user && <PaymentPanel order={order} userId={session.user.id} />}
          {!cancelled && !unpaid && (
            <div className="fl-card fl-card--o" style={{ padding: 18 }}>
              {steps.map((s, i) => {
                const done = i < st || delivered, act = i === st && !delivered;
                const last = i === steps.length - 1;
                return (
                  <div key={s} className="fl-tl" style={{ paddingBottom: last ? 0 : 18 }}>
                    <div className="fl-tl__dot" style={{ background: done ? '#2E8B3F' : act ? '#FF6A0A' : '#E5DACB', animation: act ? 'ping 1.4s infinite' : 'none' }}><Icon name={done ? 'check' : iconFor(stepsRu[i])} size={13} color="#fff" /></div>
                    {!last && <div className="fl-tl__line" style={{ background: done ? '#2E8B3F' : '#E5DACB' }} />}
                    <div style={{ paddingTop: 2 }}>
                      <div style={{ fontWeight: act ? 800 : 700, fontSize: 14, color: done || act ? '#141210' : '#8A7F73' }}>{s}</div>
                      {act && note && <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 700, marginTop: 2 }}>{note}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {order.courier_id && !pickup && !cancelled && (
            <div className="fl-card" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#FF6A0A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, flex: 'none' }}>{(courierName ?? t('Курьер', 'Курьер'))[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 15 }}>{courierName ?? t('Курьер', 'Курьер')}</div><div style={{ fontSize: 12, color: '#6B6258', fontWeight: 700 }}>{live ? (courier ? t('Местоположение обновляется', 'Орналасқан жері жаңартылып тұр') : t('Ожидаем GPS курьера', 'Курьер GPS-ін күтудеміз')) : (note ?? t('Назначен на ваш заказ', 'Тапсырысыңызға тағайындалды'))}</div></div>
            </div>
          )}

          {!pickup && dest && (
            <div className="fl-trk__map">
              <Map branches={markers} pin={dest} courier={courier} route={route} height="100%" center={dest} zoom={13} />
            </div>
          )}
        </div>

        <div className="fl-trk__right dsticky">
          <div className="fl-sum" style={{ marginTop: 22 }}>
            <BoltMark size={56} rotate={-6} style={{ position: 'absolute', left: -12, top: -26, filter: 'drop-shadow(0 4px 6px rgba(249,96,0,.25))' }} />
            <h2 className="disp fl-sum__title">{t('Состав заказа', 'Тапсырыс құрамы')}</h2>
            {order.order_items?.map((it) => (
              <div key={it.id} className="fl-sum__row" style={{ alignItems: 'flex-start' }}>
                <span>{itemName(it.product_name)}{it.meat !== 'one' ? ' · ' + meatL(it.meat) : ''}{it.extras.length ? ' + ' + it.extras.map(extraName).join(', ') : ''} × {it.quantity}</span>
                <span style={{ whiteSpace: 'nowrap' }}>{fmt(it.line_total_kzt)}</span>
              </div>
            ))}
            <div className="fl-div" aria-hidden="true"><i /></div>
            {order.discount_kzt > 0 && <div className="fl-sum__row" style={{ color: '#2E8B3F' }}><span>{t('Скидка', 'Жеңілдік')}</span><span>−{fmt(order.discount_kzt)}</span></div>}
            {!pickup && <div className="fl-sum__row"><span>{t('Доставка', 'Жеткізу')}</span><span>{fmt(order.delivery_fee_kzt)}</span></div>}
            <div className="fl-sum__total"><PricePill kk="барлығы" ru="итого" price={order.total_kzt} size="lg" /></div>
            {order.address_text && <div style={{ fontSize: 12, color: '#6B6258', marginTop: 2 }}>{order.address_text}{order.apartment ? t(', кв. ', ', пәтер ') + order.apartment : ''}</div>}
          </div>

          <div className="fl-trk__btns">
            {order.status === 'PENDING' && <button className="btn" onClick={cancel} style={{ minHeight: 52, borderRadius: 18, background: '#F3EADF', color: '#B3261E', fontWeight: 800, fontSize: 13 }}>{t('Отменить заказ', 'Тапсырыстан бас тарту')}</button>}
            <Link href={`/profile?tab=support&order=${order.id}`} className="btn" style={{ minHeight: 52, borderRadius: 18, background: '#fff', border: '2px solid #FFD9B8', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: '#141210', boxSizing: 'border-box' }}>{t('Вопрос по заказу', 'Тапсырыс бойынша сұрақ')}</Link>
          </div>
          {delivered && <button className="btn primary" onClick={repeat} style={{ marginTop: 12, width: '100%', height: 56, borderRadius: 28, fontSize: 16 }}>{t('Повторить заказ', 'Тапсырысты қайталау')}</button>}
          {(delivered || cancelled) && <Link href="/" className="btn" style={{ marginTop: 10, width: '100%', minHeight: 52, borderRadius: 26, fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', background: '#fff', color: '#141210', boxSizing: 'border-box' }}>{delivered ? t('Приятного аппетита! На главную', 'Ас болсын! Басты бетке') : t('На главную', 'Басты бетке')}</Link>}
        </div>
      </div>
    </div>
  );
}
