'use client';
import { useState } from 'react';
import { Spinner, toast } from '@/components/ui';
import { dateShortL } from '@/features/orders/status';
import { useSession } from '@/hooks/useSession';
import { useLang } from '@/i18n/LangProvider';
import { createThread, useMyOrders } from './useSupport';
import { pal, type SupportKind } from './types';
import '@/styles/flow.css';

interface Props {
  kind: SupportKind;
  dark?: boolean;
  initialOrderId?: string | null;
  onCreated: (id: string) => void;
  onCancel: () => void;
}

export function NewThreadForm({ kind, dark = false, initialOrderId = null, onCreated, onCancel }: Props) {
  const c = pal(dark);
  const { t, locale } = useLang();
  const uid = useSession().user?.id;
  const orders = useMyOrders(kind);
  const [message, setMessage] = useState('');
  const [orderId, setOrderId] = useState(initialOrderId ?? '');
  const [sending, setSending] = useState(false);
  const known = orders.some((o) => o.id === orderId);

  const submit = async () => {
    const body = message.trim();
    if (!uid) return;
    if (!body) { toast(t('Опишите вопрос', 'Сұрағыңызды сипаттаңыз')); return; }
    setSending(true);
    const id = await createThread({ userId: uid, message: body.slice(0, 2000), orderId: orderId || null, kind });
    setSending(false);
    if (!id) return;
    toast(t('Обращение отправлено', 'Өтініш жіберілді'));
    onCreated(id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, color: c.text }}>
      <h3 className="disp fl-h">{t('Новое обращение', 'Жаңа өтініш')}</h3>
      <label style={{ fontSize: 12, fontWeight: 800, color: c.muted }}>
        {t('Заказ (необязательно)', 'Тапсырыс (міндетті емес)')}
        <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="field" style={{ marginTop: 6, background: dark ? '#3A332D' : '#fff', color: dark ? '#fff' : '#141210', borderColor: dark ? '#3A332D' : undefined }}>
          <option value="">{t('Без привязки к заказу', 'Тапсырысқа байланыстырмай')}</option>
          {orderId && !known && <option value={orderId}>{t('Выбранный заказ', 'Таңдалған тапсырыс')}</option>}
          {orders.map((o) => <option key={o.id} value={o.id}>#TB-{o.order_no} · {dateShortL(o.created_at, locale)}</option>)}
        </select>
      </label>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={2000} placeholder={t('Опишите вопрос', 'Сұрағыңызды сипаттаңыз')} aria-label={t('Сообщение в поддержку', 'Қолдау қызметіне хабарлама')}
        className="field" style={{ height: 'auto', padding: 12, resize: 'vertical', background: dark ? '#3A332D' : '#fff', color: dark ? '#fff' : '#141210', borderColor: dark ? '#3A332D' : undefined }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" onClick={submit} disabled={sending} style={{ flex: 1, height: 48, borderRadius: 24 }}>{sending ? <Spinner /> : t('Отправить', 'Жіберу')}</button>
        <button className="btn" onClick={onCancel} style={{ height: 48, padding: '0 18px', borderRadius: 24, background: c.chip, color: c.chipText, fontWeight: 800 }}>{t('Отмена', 'Бас тарту')}</button>
      </div>
    </div>
  );
}
