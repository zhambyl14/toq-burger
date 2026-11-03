'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { BackBtn, PinIcon, Spinner, toast } from '@/components/ui';
import { almatyClock } from '@/features/branches/assign';
import { useQuote } from '@/features/branches/useQuote';
import { useBreak, useMounted } from '@/features/catalog/hooks';
import { cartTotals } from '@/features/cart/pricing';
import { useSession } from '@/hooks/useSession';
import { useApp } from '@/stores/app';
import { fmt } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { sb, supabaseConfigured } from '@/lib/supabase/client';
import { PAYMENT_METHODS } from '@/config/payments';

const ORDER_ERR: Record<string, string> = {
  OUT_OF_ZONE: 'Адрес вне Алматы или филиалы сейчас на перерыве',
  BRANCH_UNAVAILABLE: 'Филиал сейчас не принимает заказы. Выберите время после 08:00',
  PRODUCT_UNAVAILABLE: 'Одна из позиций сейчас недоступна. Обновите корзину',
  EXTRA_UNAVAILABLE: 'Добавка недоступна. Обновите корзину',
  PROMO_INVALID: 'Промокод недействителен',
  BELOW_MIN_ORDER: 'Сумма заказа меньше минимальной для доставки',
  ADDRESS_REQUIRED: 'Укажите адрес доставки',
  EMPTY_CART: 'Корзина пуста',
  BAD_SCHEDULE: 'Выберите корректное время',
  AUTH_REQUIRED: 'Войдите, чтобы оформить заказ',
};

/** Half-hour slots for the next 24h, skipping the 06:00–08:00 break (Almaty time). */
function slots(): { at: Date; label: string }[] {
  const out: { at: Date; label: string }[] = [];
  const start = new Date(Math.ceil((Date.now() + 45 * 60_000) / 1_800_000) * 1_800_000);
  for (let i = 0; i < 48; i++) {
    const at = new Date(start.getTime() + i * 1_800_000);
    const { time } = almatyClock(at);
    if (time >= '06:00:00' && time < '08:00:00') continue;
    const day = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: 'numeric', month: 'short' }).format(at);
    out.push({ at, label: `${day}, ${time.slice(0, 5)}` });
  }
  return out;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { products, extras, branches } = useCatalog();
  const mounted = useMounted();
  const session = useSession();
  const s = useApp();
  const brk = useBreak();
  const [timeMode, setTimeMode] = useState<'asap' | 'later'>('asap');
  const slotList = useMemo(() => (mounted ? slots() : []), [mounted]);
  const [slotIdx, setSlotIdx] = useState(0);
  const scheduled = timeMode === 'later' || brk ? slotList[slotIdx]?.at : undefined;
  const quote = useQuote(scheduled);
  const [pay, setPay] = useState(PAYMENT_METHODS.find((p) => p.enabled)?.id ?? 'CASH');
  const [contactEdit, setContact] = useState<string | null>(null);
  const contact = contactEdit ?? session.phone?.slice(2) ?? '';
  const [busy, setBusy] = useState(false);
  const [discount, setDiscount] = useState<{ code: string; amount: number } | null>(null);

  const tot = cartTotals(s.cart, products, extras, quote.fee);
  const promoCode = s.promo;
  const subtotal = tot.subtotal;
  const setApp = s.set;

  useEffect(() => {
    if (!promoCode || subtotal <= 0 || !supabaseConfigured()) return;
    let alive = true;
    sb().rpc('quote_promo', { p_code: promoCode, p_subtotal: subtotal }).then(({ data, error }) => {
      if (!alive) return;
      if (error) return;
      if (data == null) { setApp({ promo: '' }); setDiscount(null); return; }
      setDiscount({ code: promoCode, amount: data as number });
    });
    return () => { alive = false; };
  }, [promoCode, subtotal, setApp]);

  if (!mounted) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner dark /></div>;

  const disc = s.promo && discount && discount.code === s.promo ? Math.min(discount.amount, tot.subtotal) : 0;
  const payable = tot.total - disc;
  const isDelivery = s.mode === 'DELIVERY';
  const addrOk = !isDelivery || (!!s.address && !!quote.branch);
  const pickupOk = isDelivery || !!quote.branch;
  const canPlace = s.cart.length > 0 && tot.unavailable === 0 && addrOk && pickupOk && contact.length === 10;
  const branchBg = quote.branch ? '#2E8B3F' : '#B3261E';
  const branchTitle = quote.branch ? quote.branch.name : isDelivery ? (s.address ? 'Адрес вне зоны доставки' : 'Адрес не выбран') : 'Филиал не выбран';
  const branchMsg = !isDelivery
    ? (quote.branch ? quote.branch.address : 'Выберите филиал для самовывоза.')
    : quote.branch ? 'Ваш заказ будет приготовлен в ближайшем TOK BURGER.'
      : s.address ? (quote.pick?.reason === 'CLOSED' ? 'Филиал на перерыве — выберите время после 08:00.' : (quote.pick?.reason === 'OUTSIDE_CITY' ? 'Доставляем только по Алматы.' : 'Сейчас ни один филиал не принимает заказы.')) : 'Укажите адрес на карте.';

  const placeText = !s.cart.length ? 'Корзина пуста'
    : !session.user ? `Войти и оформить · ${fmt(payable)}`
      : !addrOk ? 'Выберите адрес в зоне доставки'
        : !pickupOk ? 'Выберите филиал'
          : `Оформить заказ · ${fmt(payable)}`;

  const place = async () => {
    if (busy) return;
    if (!session.user) { router.push('/auth?next=/checkout'); return; }
    if (!canPlace) { toast(contact.length !== 10 ? 'Укажите контактный телефон' : placeText); return; }
    setBusy(true);
    const key = s.pendingOrderKey ?? crypto.randomUUID();
    if (!s.pendingOrderKey) s.set({ pendingOrderKey: key });
    const { data, error } = await sb().rpc('place_order', {
      p_idempotency_key: key,
      p_mode: s.mode,
      p_items: s.cart.map((l) => ({ product_id: l.productId, meat: l.meat, quantity: l.qty, extra_ids: l.extraIds })),
      p_payment: pay,
      p_contact_phone: '+7' + contact,
      p_branch_id: isDelivery ? null : quote.branch!.id,
      p_lat: isDelivery ? s.address!.lat : null,
      p_lon: isDelivery ? s.address!.lon : null,
      p_address: isDelivery ? s.address!.label : null,
      p_apartment: s.details.apt || null, p_entrance: s.details.ent || null, p_floor: s.details.floor || null,
      p_intercom: s.details.intercom || null, p_courier_instructions: s.details.instr || null,
      p_note: s.note || null, p_promo_code: s.promo || null,
      p_scheduled_for: scheduled ? scheduled.toISOString() : null,
    });
    setBusy(false);
    if (error) {
      const code = Object.keys(ORDER_ERR).find((k) => error.message.includes(k));
      toast(code ? ORDER_ERR[code] : 'Не удалось оформить заказ. Попробуйте ещё раз');
      if (code === 'PROMO_INVALID') s.set({ promo: '', pendingOrderKey: null });
      else if (code === 'EXTRA_UNAVAILABLE' || code === 'PRODUCT_UNAVAILABLE') s.set({ pendingOrderKey: null });
      return;
    }
    s.clearCart();
    router.replace(`/track/${data as string}`);
  };

  const set = (k: 'apt' | 'ent' | 'floor' | 'intercom' | 'instr') => (e: React.ChangeEvent<HTMLInputElement>) => s.setDetail(k, e.target.value.slice(0, k === 'instr' ? 300 : 20));

  return (
    <div className="scr-in" style={{ padding: 16, paddingBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <BackBtn onClick={() => router.push('/cart')} />
        <h1 className="disp" style={{ fontSize: 22, fontWeight: 800 }}>Оформление</h1>
      </div>

      <div role="tablist" style={{ display: 'flex', gap: 6, marginTop: 16, background: '#fff', borderRadius: 22, padding: 5 }}>
        {([['DELIVERY', 'Доставка'], ['PICKUP', 'Самовывоз']] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={s.mode === k} className="btn" onClick={() => s.set({ mode: k, pickupBranchId: s.pickupBranchId ?? branches[0]?.id ?? null })}
            style={{ flex: 1, height: 44, borderRadius: 18, fontWeight: 800, fontSize: 14, background: s.mode === k ? '#FF6A0A' : '#fff', color: s.mode === k ? '#fff' : '#141210' }}>{label}</button>
        ))}
      </div>

      {isDelivery ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Адрес доставки</div>
          <Link href="/map" className="btn" style={{ marginTop: 10, width: '100%', minHeight: 56, borderRadius: 16, background: '#FFF1E0', display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', textAlign: 'left', textDecoration: 'none', boxSizing: 'border-box' }}>
            <PinIcon /><span style={{ flex: 1, fontWeight: 800, fontSize: 14 }}>{s.address?.label ?? 'Выберите адрес на карте'}</span><span style={{ color: '#C24D00', fontWeight: 800, fontSize: 13 }}>Карта</span>
          </Link>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginTop: 10 }}>
            <input className="field" value={s.details.apt} onChange={set('apt')} placeholder="Квартира" aria-label="Квартира" />
            <input className="field" value={s.details.ent} onChange={set('ent')} placeholder="Подъезд" aria-label="Подъезд" />
            <input className="field" value={s.details.floor} onChange={set('floor')} placeholder="Этаж" aria-label="Этаж" />
            <input className="field" value={s.details.intercom} onChange={set('intercom')} placeholder="Домофон" aria-label="Домофон" />
          </div>
          <input className="field" value={s.details.instr} onChange={set('instr')} placeholder="Комментарий курьеру" aria-label="Комментарий курьеру" style={{ marginTop: 8 }} />
        </div>
      ) : (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Филиал для самовывоза</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {branches.map((b) => (
              <button key={b.id} className="btn" onClick={() => s.set({ pickupBranchId: b.id })}
                style={{ minHeight: 52, borderRadius: 14, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', textAlign: 'left', border: `2px solid ${s.pickupBranchId === b.id ? '#FF6A0A' : '#F3EADF'}` }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${s.pickupBranchId === b.id ? '#FF6A0A' : '#F3EADF'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.pickupBranchId === b.id ? '#FF6A0A' : 'transparent' }} />
                </span>
                <span style={{ fontWeight: 800, fontSize: 14 }}>{b.short_name}<br /><span style={{ fontSize: 12, color: '#6B6258', fontWeight: 600 }}>{b.address}</span></span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 14, background: branchBg, color: '#fff', borderRadius: 22, padding: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.8 }}>ГОТОВИТ ФИЛИАЛ</div>
          <div style={{ fontWeight: 800, fontSize: 15, marginTop: 3 }}>{branchTitle}</div>
          <div style={{ fontSize: 12, marginTop: 3, fontWeight: 600, opacity: 0.9 }}>{branchMsg}</div>
        </div>
        <Link href="/branches" className="btn" style={{ flex: 'none', minHeight: 44, padding: '0 14px', borderRadius: 14, background: 'rgba(255,255,255,.22)', color: 'inherit', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', textDecoration: 'none' }}>Смотреть</Link>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Время</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {([['asap', 'Как можно скорее', brk], ['later', 'Ко времени', false]] as const).map(([k, label, dis]) => {
            const act = (brk ? 'later' : timeMode) === k;
            return (
              <button key={k} className="btn" disabled={dis} onClick={() => setTimeMode(k)}
                style={{ flex: 1, minHeight: 48, borderRadius: 14, fontWeight: 800, fontSize: 13, background: act ? '#FF6A0A' : '#F3EADF', color: act ? '#fff' : '#141210', opacity: dis ? 0.4 : 1 }}>{label}</button>
            );
          })}
        </div>
        {(timeMode === 'later' || brk) && (
          <select className="field" value={slotIdx} onChange={(e) => setSlotIdx(Number(e.target.value))} aria-label="Время заказа" style={{ marginTop: 10 }}>
            {slotList.map((sl, i) => <option key={i} value={i}>{sl.label}</option>)}
          </select>
        )}
        {brk && <div style={{ fontSize: 12, color: '#C24D00', marginTop: 8, fontWeight: 700 }}>Перерыв 06:00–08:00: доступны только запланированные заказы.</div>}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Контактный телефон</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, height: 48, borderRadius: 14, border: '2px solid #F3EADF', padding: '0 12px' }}>
          <span style={{ fontWeight: 800 }}>+7</span>
          <input value={contact.replace(/(\d{3})(\d{0,3})(\d{0,2})(\d{0,2})/, (_, a, b, c, d) => [a, b, c, d].filter(Boolean).join(' '))} inputMode="numeric" aria-label="Контактный телефон"
            onChange={(e) => setContact(e.target.value.replace(/\D/g, '').slice(0, 10))} style={{ flex: 1, border: 0, outline: 'none', fontWeight: 800, fontSize: 15, minWidth: 0 }} placeholder={session.phone ? formatPhone(session.phone).slice(3) : '747 400 53 47'} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Оплата</div>
        <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {PAYMENT_METHODS.map((p) => (
            <button key={p.id} role="radio" aria-checked={pay === p.id} disabled={!p.enabled} className="btn" onClick={() => setPay(p.id)}
              style={{ minHeight: 52, borderRadius: 14, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', textAlign: 'left', background: '#fff', border: `2px solid ${pay === p.id ? '#FF6A0A' : '#F3EADF'}`, opacity: p.enabled ? 1 : 0.5 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${pay === p.id ? '#FF6A0A' : '#F3EADF'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: pay === p.id ? '#FF6A0A' : 'transparent' }} />
              </span>
              <span style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>{p.label}</span>
              {!p.enabled && <span style={{ fontSize: 11, fontWeight: 800, color: '#6B6258' }}>скоро</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14, fontSize: 14, fontWeight: 700, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#6B6258' }}>Позиций</span><span>{tot.count}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#6B6258' }}>Сумма</span><span>{fmt(tot.subtotal)}</span></div>
        {disc > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2E8B3F' }}><span>Скидка ({s.promo})</span><span>−{fmt(disc)}</span></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#6B6258' }}>Доставка</span><span>{isDelivery ? fmt(quote.fee) : '—'}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800 }}><span>К оплате</span><span>{fmt(payable)}</span></div>
        <div style={{ fontSize: 11, color: '#6B6258', fontWeight: 600 }}>Итоговая сумма подтверждается сервером по актуальным ценам.</div>
      </div>
      <button className="btn primary" onClick={place} disabled={busy} style={{ marginTop: 14, width: '100%', height: 56, borderRadius: 28, fontSize: 16, opacity: canPlace || !session.user ? 1 : 0.45, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {busy ? <Spinner /> : placeText}
      </button>
    </div>
  );
}
