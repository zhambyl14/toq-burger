'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui';
import { qrUrl, uploadReceipt, usePayment, usePaymentSettings } from '@/features/payments/settings';
import { useLang } from '@/i18n/LangProvider';
import { fmt } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import type { OrderRow } from '@/types/catalog';

/** "mm:ss" left until the unpaid order is auto-cancelled; null when no deadline applies. */
function useCountdown(deadline: number | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);
  if (deadline == null) return null;
  const left = Math.max(0, Math.floor((deadline - now) / 1000));
  return `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
}

/**
 * Manual Kaspi payment: shows the admin-configured QR / link / phone, takes the receipt and shows review status.
 * The order only reaches the kitchen after a moderator/admin confirms the receipt.
 */
export function PaymentPanel({ order, userId }: { order: OrderRow; userId: string }) {
  const { t, tx, lang } = useLang();
  const settings = usePaymentSettings();
  const { payment, reload } = usePayment(order.id, order.payment_state);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const state = order.payment_state;
  const waiting = state === 'AWAITING_RECEIPT' || state === 'REJECTED';
  const base = state === 'REJECTED' && payment?.reviewed_at ? new Date(payment.reviewed_at).getTime() : new Date(order.created_at).getTime();
  const left = useCountdown(waiting && settings ? base + settings.pay_timeout_min * 60_000 : null);

  if (order.payment_method !== 'KASPI_QR' || order.status === 'CANCELLED' || state === 'CONFIRMED' || state === 'NOT_REQUIRED') return null;

  const qr = settings ? qrUrl(settings.kaspi_qr_path) : null;
  const note = settings ? tx(settings.kaspi_note ?? '', settings.kaspi_note_kk) : '';

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { toast(text); }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || busy) return;
    setBusy(true);
    const r = await uploadReceipt(userId, order.id, f);
    setBusy(false);
    if (r === 'OK') { toast(t('Чек отправлен на проверку', 'Чек тексеруге жіберілді')); reload(); return; }
    toast(r === 'TYPE' ? t('Нужен снимок (JPG/PNG/WebP) или PDF', 'Сурет (JPG/PNG/WebP) немесе PDF қажет')
      : r === 'SIZE' ? t('Файл больше 5 МБ', 'Файл 5 МБ-тан үлкен')
        : t('Не удалось загрузить чек. Попробуйте ещё раз', 'Чекті жүктеу мүмкін болмады. Қайтадан көріңіз'));
  };

  const title = state === 'REVIEW' ? t('Чек на проверке', 'Чек тексеруде')
    : state === 'REJECTED' ? t('Оплата не подтверждена', 'Төлем расталмады')
      : t('Оплатите заказ через Kaspi', 'Тапсырысты Kaspi арқылы төлеңіз');

  return (
    <section className="fl-card fl-card--o" style={{ marginBottom: 14 }} aria-label={title}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 className="disp" style={{ fontSize: 17, fontWeight: 800, flex: 1, minWidth: 180 }}>{title}</h2>
        {left && <span role="timer" style={{ padding: '4px 10px', borderRadius: 12, background: '#FFF1E0', color: '#C24D00', fontWeight: 800, fontSize: 13 }}>{t('Осталось', 'Қалды')} {left}</span>}
      </div>

      {state === 'REVIEW' && (
        <p style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.45, marginTop: 8 }}>
          {t('Мы получили ваш чек и проверяем оплату. Как только подтвердим — заказ сразу уйдёт на кухню. Эта страница обновится сама.', 'Чегіңізді алдық, төлемді тексеріп жатырмыз. Растаған бойда тапсырыс асханаға жөнелтіледі. Бет өздігінен жаңарады.')}
        </p>
      )}
      {state === 'REJECTED' && (
        <div role="alert" style={{ marginTop: 8, background: '#FDECEA', color: '#B3261E', borderRadius: 14, padding: '10px 14px', fontSize: 14, fontWeight: 700, lineHeight: 1.4 }}>
          {payment?.reject_reason ?? t('Чек не прошёл проверку', 'Чек тексеруден өтпеді')}
          <div style={{ fontWeight: 600, marginTop: 4 }}>{t('Оплатите и загрузите новый чек.', 'Төлеп, жаңа чек жүктеңіз.')}</div>
        </div>
      )}

      {state !== 'REVIEW' && (
        <>
          <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: '#6B6258' }}>{t('Сумма к оплате', 'Төлем сомасы')}</div>
          <div className="disp" style={{ fontSize: 30, fontWeight: 800, color: '#C24D00' }}>{fmt(order.total_kzt)}</div>

          {!settings ? <div style={{ height: 80 }} aria-busy="true" /> : (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 12 }}>
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt={t('QR-код для оплаты', 'Төлем QR-коды')} width={176} height={176} style={{ width: 176, height: 176, objectFit: 'contain', borderRadius: 16, border: '2px solid #F3EADF', background: '#fff' }} />
              )}
              <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {settings.kaspi_pay_url && (
                  <a href={settings.kaspi_pay_url} target="_blank" rel="noopener noreferrer" className="btn primary"
                    style={{ minHeight: 52, borderRadius: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontSize: 15 }}>
                    {t('Открыть Kaspi и оплатить', 'Kaspi-ді ашып төлеу')} ↗
                  </a>
                )}
                {settings.kaspi_phone && (
                  <div style={{ background: '#F3EADF', borderRadius: 16, padding: '10px 14px' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#6B6258' }}>{t('Перевод на Kaspi по номеру', 'Kaspi-ге нөмір бойынша аудару')}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
                      <b style={{ fontSize: 18, flex: 1 }}>{formatPhone(settings.kaspi_phone)}</b>
                      <button className="btn" onClick={() => copy(settings.kaspi_phone!)} style={{ minHeight: 40, padding: '0 14px', borderRadius: 14, background: '#fff', fontWeight: 800, fontSize: 13 }}>{copied ? t('Скопировано', 'Көшірілді') : t('Копировать', 'Көшіру')}</button>
                    </div>
                    {settings.kaspi_recipient && <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{t('Получатель', 'Алушы')}: {settings.kaspi_recipient}</div>}
                  </div>
                )}
                <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.4 }}>{t('В комментарии к переводу укажите', 'Аударым түсініктемесіне жазыңыз')}: <b>#TB-{order.order_no}</b></div>
                {note && <div style={{ fontSize: 13, fontWeight: 600, color: '#4A423A', lineHeight: 1.4 }}>{note}</div>}
              </div>
            </div>
          )}

          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" onChange={onFile} hidden aria-label={t('Файл чека', 'Чек файлы')} />
          <button className="btn dark" disabled={busy} onClick={() => fileRef.current?.click()}
            style={{ marginTop: 14, width: '100%', minHeight: 54, borderRadius: 27, fontSize: 15 }}>
            {busy ? <span className="spinner" /> : state === 'REJECTED' ? t('Загрузить новый чек', 'Жаңа чек жүктеу') : t('Я оплатил — загрузить чек', 'Төледім — чекті жүктеу')}
          </button>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6B6258', marginTop: 8, lineHeight: 1.4 }}>
            {lang === 'kk' ? 'Скриншот немесе PDF, 5 МБ-қа дейін. Төлем уақытында түспесе, тапсырыс автоматты түрде бас тартылады.' : 'Скриншот или PDF до 5 МБ. Если оплата не поступит вовремя, заказ отменится автоматически.'}
          </div>
        </>
      )}
    </section>
  );
}
