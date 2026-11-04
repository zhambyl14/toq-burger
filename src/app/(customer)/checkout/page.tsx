'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { PinIcon, Spinner, toast } from '@/components/ui';
import { almatyClock } from '@/features/branches/assign';
import { useQuote } from '@/features/branches/useQuote';
import { useBreak, useMounted } from '@/features/catalog/hooks';
import { cartTotals, unitPrice } from '@/features/cart/pricing';
import { useSession } from '@/hooks/useSession';
import { useLang } from '@/i18n/LangProvider';
import { useApp } from '@/stores/app';
import { fmt } from '@/lib/money';
import { BoltMark } from '@/components/customer/BoltMark';
import { PricePill } from '@/components/customer/PricePill';
import { PriceTag } from '@/components/customer/PriceTag';
import { formatPhone } from '@/lib/phone';
import { sb, supabaseConfigured } from '@/lib/supabase/client';
import { PAYMENT_METHODS } from '@/config/payments';
import type { Meat } from '@/types/catalog';
import '@/styles/flow.css';

/** [ru, kk] */
const ORDER_ERR: Record<string, [string, string]> = {
  OUT_OF_ZONE: ['Адрес вне Алматы или филиалы сейчас на перерыве', 'Мекенжай Алматыдан тыс немесе филиалдар қазір үзілісте'],
  BRANCH_UNAVAILABLE: ['Филиал сейчас не принимает заказы. Выберите время после 08:00', 'Филиал қазір тапсырыс қабылдамайды. 08:00-ден кейінгі уақытты таңдаңыз'],
  PRODUCT_UNAVAILABLE: ['Одна из позиций сейчас недоступна. Обновите корзину', 'Позициялардың бірі қазір қолжетімсіз. Себетті жаңартыңыз'],
  EXTRA_UNAVAILABLE: ['Добавка недоступна. Обновите корзину', 'Қосымша қолжетімсіз. Себетті жаңартыңыз'],
  PROMO_INVALID: ['Промокод недействителен', 'Промокод жарамсыз'],
  BELOW_MIN_ORDER: ['Сумма заказа меньше минимальной для доставки', 'Тапсырыс сомасы жеткізудің ең төменгі сомасынан аз'],
  ADDRESS_REQUIRED: ['Укажите адрес доставки', 'Жеткізу мекенжайын көрсетіңіз'],
  EMPTY_CART: ['Корзина пуста', 'Себет бос'],
  BAD_SCHEDULE: ['Выберите корректное время', 'Дұрыс уақытты таңдаңыз'],
  AUTH_REQUIRED: ['Войдите, чтобы оформить заказ', 'Тапсырыс беру үшін кіріңіз'],
};

/** Half-hour slots for the next 24h, skipping the 06:00–08:00 break (Almaty time). */
function slots(locale: string): { at: Date; label: string }[] {
  const out: { at: Date; label: string }[] = [];
  const start = new Date(Math.ceil((Date.now() + 45 * 60_000) / 1_800_000) * 1_800_000);
  for (let i = 0; i < 48; i++) {
    const at = new Date(start.getTime() + i * 1_800_000);
    const { time } = almatyClock(at);
    if (time >= '06:00:00' && time < '08:00:00') continue;
    const day = new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Almaty', day: 'numeric', month: 'short' }).format(at);
    out.push({ at, label: `${day}, ${time.slice(0, 5)}` });
  }
  return out;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { t, tx, locale } = useLang();
  const { products, extras, branches } = useCatalog();
  const mounted = useMounted();
  const session = useSession();
  const s = useApp();
  const brk = useBreak();
  const [timeMode, setTimeMode] = useState<'asap' | 'later'>('asap');
  const slotList = useMemo(() => (mounted ? slots(locale) : []), [mounted, locale]);
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

  const meatL = (m: Meat) => (m === 'beef' ? t('Говядина', 'Сиыр еті') : m === 'chicken' ? t('Курица', 'Тауық еті') : '');

  if (!mounted) {
    return (
      <div className="fl-page" aria-busy="true" aria-label={t('Загрузка', 'Жүктелуде')}>
        <div style={{ width: 180, height: 30, borderRadius: 10, background: '#F3EADF', animation: 'fade .9s ease-in-out infinite alternate' }} />
        {[70, 150, 90, 120].map((h, i) => <div key={i} style={{ height: h, borderRadius: 22, background: '#fff', marginTop: 14, animation: 'fade .9s ease-in-out infinite alternate' }} />)}
      </div>
    );
  }

  const disc = s.promo && discount && discount.code === s.promo ? Math.min(discount.amount, tot.subtotal) : 0;
  const payable = tot.total - disc;
  const isDelivery = s.mode === 'DELIVERY';
  const addrOk = !isDelivery || (!!s.address && !!quote.branch);
  const pickupOk = isDelivery || !!quote.branch;
  const canPlace = s.cart.length > 0 && tot.unavailable === 0 && addrOk && pickupOk && contact.length === 10;
  const branchBg = quote.branch ? '#2E8B3F' : '#B3261E';
  const branchTitle = quote.branch ? quote.branch.name : isDelivery ? (s.address ? t('Адрес вне зоны доставки', 'Мекенжай жеткізу аймағынан тыс') : t('Адрес не выбран', 'Мекенжай таңдалмаған')) : t('Филиал не выбран', 'Филиал таңдалмаған');
  const branchMsg = !isDelivery
    ? (quote.branch ? quote.branch.address : t('Выберите филиал для самовывоза.', 'Өзі алып кету үшін филиалды таңдаңыз.'))
    : quote.branch ? t('Ваш заказ будет приготовлен в ближайшем TOK BURGER.', 'Тапсырысыңыз ең жақын TOK BURGER-де дайындалады.')
      : s.address ? (quote.pick?.reason === 'CLOSED' ? t('Филиал на перерыве — выберите время после 08:00.', 'Филиал үзілісте — 08:00-ден кейінгі уақытты таңдаңыз.') : (quote.pick?.reason === 'OUTSIDE_CITY' ? t('Доставляем только по Алматы.', 'Тек Алматы бойынша жеткіземіз.') : t('Сейчас ни один филиал не принимает заказы.', 'Қазір ешбір филиал тапсырыс қабылдамайды.'))) : t('Укажите адрес на карте.', 'Мекенжайды картадан көрсетіңіз.');

  const phoneHint = contact.length === 0 ? t('Нужен номер для связи с курьером', 'Курьермен байланысу үшін нөмір керек') : contact.length < 10 ? t(`Введите ещё ${10 - contact.length} цифр`, `Тағы ${10 - contact.length} сан енгізіңіз`) : '';
  const stepDone = [addrOk && pickupOk, true, true];
  const stepTitles = [t('Адрес', 'Мекенжай'), t('Время', 'Уақыт'), t('Оплата', 'Төлем')];
  const payLabel = (id: string, fallback: string) => (id === 'CASH' ? t('Наличными или картой курьеру / на кассе', 'Қолма-қол немесе картамен курьерге / кассада') : id === 'ONLINE' ? t('Онлайн-оплата картой', 'Картамен онлайн төлеу') : fallback);
  const picked = PAYMENT_METHODS.find((x) => x.id === pay);
  const stepSub = [
    addrOk && pickupOk ? (isDelivery ? (quote.branch?.short_name ?? t('Готово', 'Дайын')) : t('Самовывоз', 'Өзі алып кету')) : t('Выберите', 'Таңдаңыз'),
    scheduled ? (slotList[slotIdx]?.label ?? t('Ко времени', 'Уақытқа')) : t('Скорее', 'Тезірек'),
    picked ? (picked.id === 'CASH' ? t('Наличными', 'Қолма-қол') : payLabel(picked.id, picked.label)) : t('Выберите', 'Таңдаңыз'),
  ];

  const placeText = !s.cart.length ? t('Корзина пуста', 'Себет бос')
    : !session.user ? `${t('Войти и оформить', 'Кіріп, тапсырыс беру')} · ${fmt(payable)}`
      : !addrOk ? t('Выберите адрес в зоне доставки', 'Жеткізу аймағындағы мекенжайды таңдаңыз')
        : !pickupOk ? t('Выберите филиал', 'Филиалды таңдаңыз')
          : `${t('Оформить заказ', 'Тапсырыс беру')} · ${fmt(payable)}`;

  const place = async () => {
    if (busy) return;
    if (!session.user) { router.push('/auth?next=/checkout'); return; }
    if (!canPlace) { toast(contact.length !== 10 ? t('Укажите контактный телефон', 'Байланыс телефонын көрсетіңіз') : placeText); return; }
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
      toast(code ? t(ORDER_ERR[code][0], ORDER_ERR[code][1]) : t('Не удалось оформить заказ. Попробуйте ещё раз', 'Тапсырыс беру мүмкін болмады. Қайтадан көріңіз'));
      if (code === 'PROMO_INVALID') s.set({ promo: '', pendingOrderKey: null });
      else if (code === 'EXTRA_UNAVAILABLE' || code === 'PRODUCT_UNAVAILABLE') s.set({ pendingOrderKey: null });
      return;
    }
    s.clearCart();
    router.replace(`/track/${data as string}`);
  };

  const set = (k: 'apt' | 'ent' | 'floor' | 'intercom' | 'instr') => (e: React.ChangeEvent<HTMLInputElement>) => s.setDetail(k, e.target.value.slice(0, k === 'instr' ? 300 : 20));

  const radio = (on: boolean) => (
    <span className="fl-radio" style={{ border: `2px solid ${on ? '#FF6A0A' : '#E5DACB'}` }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: on ? '#FF6A0A' : 'transparent' }} />
    </span>
  );

  const cta = (
    <button className="btn primary" onClick={place} disabled={busy} style={{ height: 56, borderRadius: 28, fontSize: 16, opacity: canPlace || !session.user ? 1 : 0.55, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 28px rgba(255,106,10,.4)' }}>
      {busy ? <Spinner /> : placeText}
    </button>
  );
  const status = !canPlace && session.user && s.cart.length > 0
    ? <div role="status" style={{ fontSize: 12, fontWeight: 800, color: '#C24D00' }}>{!addrOk || !pickupOk ? placeText : phoneHint || t('Проверьте корзину', 'Себетті тексеріңіз')}</div>
    : null;

  return (
    <div className="scr-in fl-page" style={{ paddingBottom: 24 }}>
      <div className="fl-head">
        <button className="btn fl-back" onClick={() => router.push('/cart')} aria-label={t('Назад', 'Артқа')}>←</button>
        <h1 className="disp fl-title">{t('Оформление', 'Тапсырыс беру')}</h1>
        <BoltMark size={34} rotate={-8} />
      </div>

      <ol aria-label={t('Шаги оформления', 'Рәсімдеу қадамдары')} className="fl-steps">
        {stepTitles.map((title, i) => (
          <li key={i}>
            <a href={`#co-${i}`} className={'btn fl-step' + (stepDone[i] ? ' fl-step--done' : '')}>
              <span className="fl-step__t">
                <span aria-hidden="true" className="fl-step__n">{stepDone[i] ? '✓' : i + 1}</span>
                {title}
              </span>
              <span className="fl-step__s">{stepSub[i]}</span>
            </a>
          </li>
        ))}
      </ol>

      <div className="dsplit" style={{ marginTop: 14 }}>
        <div className="fl-stack" style={{ minWidth: 0 }}>
          <div role="tablist" className="fl-modes" style={{ marginTop: 0 }}>
            {([['DELIVERY', t('Доставка', 'Жеткізу')], ['PICKUP', t('Самовывоз', 'Өзі алып кету')]] as const).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={s.mode === k} className="btn" onClick={() => s.set({ mode: k, pickupBranchId: s.pickupBranchId ?? branches[0]?.id ?? null })}>{label}</button>
            ))}
          </div>

          {isDelivery ? (
            <div id="co-0" className="fl-card" style={{ scrollMarginTop: 92 }}>
              <h2 className="disp fl-h">{t('Адрес доставки', 'Жеткізу мекенжайы')}</h2>
              <Link href="/map" className="btn fl-addr">
                <PinIcon /><span style={{ flex: 1, fontWeight: 800, fontSize: 14 }}>{s.address?.label ?? t('Выберите адрес на карте', 'Мекенжайды картадан таңдаңыз')}</span><span style={{ color: '#C24D00', fontWeight: 800, fontSize: 13 }}>{t('Карта', 'Карта')}</span>
              </Link>
              <div className="fl-fields">
                <input className="field" value={s.details.apt} onChange={set('apt')} placeholder={t('Квартира', 'Пәтер')} aria-label={t('Квартира', 'Пәтер')} />
                <input className="field" value={s.details.ent} onChange={set('ent')} placeholder={t('Подъезд', 'Кіреберіс')} aria-label={t('Подъезд', 'Кіреберіс')} />
                <input className="field" value={s.details.floor} onChange={set('floor')} placeholder={t('Этаж', 'Қабат')} aria-label={t('Этаж', 'Қабат')} />
                <input className="field" value={s.details.intercom} onChange={set('intercom')} placeholder={t('Домофон', 'Домофон')} aria-label={t('Домофон', 'Домофон')} />
              </div>
              <input className="field" value={s.details.instr} onChange={set('instr')} placeholder={t('Комментарий курьеру', 'Курьерге түсініктеме')} aria-label={t('Комментарий курьеру', 'Курьерге түсініктеме')} style={{ marginTop: 8 }} />
            </div>
          ) : (
            <div id="co-0" className="fl-card" style={{ scrollMarginTop: 92 }}>
              <h2 className="disp fl-h">{t('Филиал для самовывоза', 'Өзі алып кету филиалы')}</h2>
              <div role="radiogroup" aria-label={t('Филиал для самовывоза', 'Өзі алып кету филиалы')} className="fl-opts">
                {branches.map((b) => {
                  const on = s.pickupBranchId === b.id;
                  return (
                    <button key={b.id} role="radio" aria-checked={on} className={'btn fl-opt' + (on ? ' fl-opt--on' : '')} onClick={() => s.set({ pickupBranchId: b.id })}
                      style={{ border: `2px solid ${on ? '#FF6A0A' : '#F3EADF'}`, minHeight: 56 }}>
                      {radio(on)}
                      <span style={{ fontWeight: 800, fontSize: 14, minWidth: 0 }}>{b.short_name}<br /><span style={{ fontSize: 12, color: '#6B6258', fontWeight: 600 }}>{b.address}</span></span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="fl-branchbox" style={{ background: branchBg }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.8 }}>{t('ГОТОВИТ ФИЛИАЛ', 'ФИЛИАЛ ДАЙЫНДАЙДЫ')}</div>
              <div style={{ fontWeight: 800, fontSize: 15, marginTop: 3 }}>{branchTitle}</div>
              <div style={{ fontSize: 12, marginTop: 3, fontWeight: 600, opacity: 0.9 }}>{branchMsg}</div>
            </div>
            <Link href="/branches" className="btn" style={{ flex: 'none', minHeight: 44, padding: '0 14px', borderRadius: 14, background: 'rgba(255,255,255,.22)', color: 'inherit', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', textDecoration: 'none' }}>{t('Смотреть', 'Көру')}</Link>
          </div>

          <div className="fl-pair">
            <div id="co-1" className="fl-card" style={{ scrollMarginTop: 92 }}>
              <h2 className="disp fl-h">{t('Время', 'Уақыт')}</h2>
              <div className="fl-times">
                {([['asap', t('Как можно скорее', 'Тезірек'), brk], ['later', t('Ко времени', 'Уақытқа'), false]] as const).map(([k, label, dis]) => {
                  const act = (brk ? 'later' : timeMode) === k;
                  return (
                    <button key={k} className="btn" disabled={dis} onClick={() => setTimeMode(k)}
                      style={{ background: act ? '#FF6A0A' : '#F3EADF', color: act ? '#fff' : '#141210', opacity: dis ? 0.4 : 1 }}>{label}</button>
                  );
                })}
              </div>
              {(timeMode === 'later' || brk) && (
                <select className="field" value={slotIdx} onChange={(e) => setSlotIdx(Number(e.target.value))} aria-label={t('Время заказа', 'Тапсырыс уақыты')} style={{ marginTop: 10 }}>
                  {slotList.map((sl, i) => <option key={i} value={i}>{sl.label}</option>)}
                </select>
              )}
              {brk && <div style={{ fontSize: 12, color: '#C24D00', marginTop: 8, fontWeight: 700 }}>{t('Перерыв 06:00–08:00: доступны только запланированные заказы.', 'Үзіліс 06:00–08:00: тек алдын ала берілген тапсырыстар қолжетімді.')}</div>}
            </div>

            <div className="fl-card">
              <h2 className="disp fl-h">{t('Контактный телефон', 'Байланыс телефоны')}</h2>
              <div className="fl-phone" style={{ borderColor: contact.length === 10 ? '#2E8B3F' : '#F3EADF' }}>
                <span style={{ fontWeight: 800 }}>+7</span>
                <input value={contact.replace(/(\d{3})(\d{0,3})(\d{0,2})(\d{0,2})/, (_, a, b, c, d) => [a, b, c, d].filter(Boolean).join(' '))} inputMode="numeric" aria-label={t('Контактный телефон', 'Байланыс телефоны')}
                  onChange={(e) => setContact(e.target.value.replace(/\D/g, '').slice(0, 10))} style={{ flex: 1, border: 0, outline: 'none', fontWeight: 800, fontSize: 15, minWidth: 0, background: 'transparent' }} placeholder={session.phone ? formatPhone(session.phone).slice(3) : '747 400 53 47'} aria-invalid={contact.length !== 10} />
              </div>
              {phoneHint && <div role="status" style={{ fontSize: 12, fontWeight: 700, color: '#C24D00', marginTop: 6 }}>{phoneHint}</div>}
            </div>
          </div>

          <div id="co-2" className="fl-card" style={{ scrollMarginTop: 92 }}>
            <h2 className="disp fl-h">{t('Оплата', 'Төлем')}</h2>
            <div role="radiogroup" aria-label={t('Способ оплаты', 'Төлем тәсілі')} className="fl-opts">
              {PAYMENT_METHODS.map((p) => {
                const on = pay === p.id;
                return (
                  <button key={p.id} role="radio" aria-checked={on} disabled={!p.enabled} className={'btn fl-opt' + (on ? ' fl-opt--on' : '')} onClick={() => setPay(p.id)}
                    style={{ border: `2px solid ${on ? '#FF6A0A' : '#F3EADF'}`, opacity: p.enabled ? 1 : 0.5 }}>
                    {radio(on)}
                    <span style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>{payLabel(p.id, p.label)}</span>
                    {!p.enabled && <span style={{ fontSize: 11, fontWeight: 800, color: '#6B6258' }}>{t('скоро', 'жақында')}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="dsticky fl-aside" aria-label={t('Итог заказа', 'Тапсырыс қорытындысы')}>
          <div className="fl-sum">
            <BoltMark size={56} rotate={-6} style={{ position: 'absolute', left: -12, top: -26, filter: 'drop-shadow(0 4px 6px rgba(249,96,0,.25))' }} />
            <h2 className="disp fl-sum__title">{t('Ваш заказ', 'Сіздің тапсырысыңыз')} · {tot.count} {t('шт.', 'дана')}</h2>
            <div className="fl-items">
              {s.cart.map((l) => {
                const p = products.find((x) => x.id === l.productId);
                const u = unitPrice(p, l.meat, l.extraIds, extras);
                return (
                  <div key={l.key} className="fl-items__row">
                    <span style={{ minWidth: 0 }}>{l.qty} × {p ? tx(p.name, p.nameKk) : t('Позиция недоступна', 'Позиция қолжетімсіз')}{p?.category === 'burgers' ? ' · ' + meatL(l.meat) : ''}</span>
                    {u != null ? <PriceTag amount={u * l.qty} tone="ink" size={13} weight={700} /> : <span>—</span>}
                  </div>
                );
              })}
            </div>
            <div className="fl-div" aria-hidden="true"><i /></div>
            <div className="fl-sum__row"><span style={{ color: '#6B6258' }}>{t('Сумма', 'Сома')}</span><PriceTag amount={tot.subtotal} tone="ink" size={14} weight={700} /></div>
            {disc > 0 && <div className="fl-sum__row" style={{ color: '#2E8B3F' }}><span>{t('Скидка', 'Жеңілдік')} ({s.promo})</span><PriceTag amount={disc} prefix="−" tone="ink" size={14} weight={700} /></div>}
            <div className="fl-sum__row"><span style={{ color: '#6B6258' }}>{t('Доставка', 'Жеткізу')}</span>{isDelivery ? <PriceTag amount={quote.fee} tone="ink" size={14} weight={700} /> : <span>—</span>}</div>
            <div className="fl-sum__total"><PricePill kk="төлеуге" ru="к оплате" price={payable} size="lg" /></div>
            <div style={{ fontSize: 11, color: '#6B6258', fontWeight: 600 }}>{t('Итоговая сумма подтверждается сервером по актуальным ценам.', 'Түпкілікті сома сервермен өзекті бағалар бойынша расталады.')}</div>
            <div className="only-desktop">
              {status}
              <div className="fl-cta" style={{ marginTop: 10 }}>{cta}</div>
            </div>
          </div>
        </aside>
      </div>

      <div className="only-mobile">
        {status && <div style={{ marginTop: 10 }}>{status}</div>}
        <div className="fl-cta fl-cta--flat">{cta}</div>
      </div>
    </div>
  );
}
