'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Label, PageHead, Panel, Toggle } from '@/components/admin/kit';
import { Spinner, toast } from '@/components/ui';
import { errText } from '@/features/admin/transitions';
import { DEFAULT_SETTINGS, qrUrl, type PaymentSettings } from '@/features/payments/settings';
import { dateShort, timeHM } from '@/features/orders/status';
import { useSession } from '@/hooks/useSession';
import { fmt } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { sb } from '@/lib/supabase/client';
import type { PaymentState } from '@/types/catalog';

interface PayInfo { receipt_path: string | null; receipt_uploaded_at: string | null; reject_reason: string | null; attempts: number }
const payOf = (r: QueueRow): PayInfo | undefined => (Array.isArray(r.payments) ? r.payments[0] : r.payments ?? undefined);

interface QueueRow {
  id: string; order_no: number; total_kzt: number; contact_phone: string; customer_name: string | null; created_at: string;
  payment_state: PaymentState; branch_id: string;
  payments: PayInfo | PayInfo[] | null;
}
interface RefundRow { order_id: string; amount_kzt: number; orders: { order_no: number; contact_phone: string; cancelled_at: string | null } | null }

const STATE: Record<string, [string, string]> = {
  REVIEW: ['Чек на проверке', '#C24D00'], AWAITING_RECEIPT: ['Ждём оплату', '#6B6258'], REJECTED: ['Отклонено — ждём новый чек', '#B3261E'],
};

export default function AdminPayments() {
  const session = useSession();
  const isAdmin = session.roles.includes('ADMIN');
  return (
    <>
      <PageHead title="Оплата" />
      <Queue />
      <Refunds />
      {isAdmin ? <Settings /> : <Panel style={{ marginTop: 20, fontWeight: 700, color: '#6B6258' }}>Настройки способов оплаты меняет только администратор.</Panel>}
    </>
  );
}

// ------------------------------------------------------------------ receipt review queue
function Queue() {
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [branches, setBranches] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ id: string; url: string | null; pdf: boolean } | null>(null);

  const load = useCallback(async () => {
    await sb().rpc('expire_unpaid_orders');
    const [o, b] = await Promise.all([
      sb().from('orders').select('id,order_no,total_kzt,contact_phone,customer_name,created_at,payment_state,branch_id,payments(receipt_path,receipt_uploaded_at,reject_reason,attempts)')
        .eq('status', 'PENDING').eq('payment_method', 'KASPI_QR').in('payment_state', ['REVIEW', 'AWAITING_RECEIPT', 'REJECTED']).order('created_at', { ascending: true }).limit(200),
      sb().from('branches').select('id,short_name'),
    ]);
    if (!o.error) setRows((o.data as unknown as QueueRow[]) ?? []);
    setBranches(Object.fromEntries(((b.data as { id: string; short_name: string }[]) ?? []).map((x) => [x.id, x.short_name])));
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const poll = setInterval(load, 20_000);
    const ch = sb().channel('admin-payments').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load()).subscribe();
    return () => { clearTimeout(first); clearInterval(poll); sb().removeChannel(ch); };
  }, [load]);

  const showReceipt = async (r: QueueRow) => {
    const path = payOf(r)?.receipt_path;
    if (!path) return;
    setReceipt({ id: r.id, url: null, pdf: path.endsWith('.pdf') });
    const { data } = await sb().storage.from('receipts').createSignedUrl(path, 300);
    setReceipt({ id: r.id, url: data?.signedUrl ?? null, pdf: path.endsWith('.pdf') });
  };

  const decide = async (r: QueueRow, approve: boolean) => {
    if (!approve && reason.trim().length < 3) return toast('Укажите причину отклонения');
    setBusy(r.id);
    const { error } = await sb().rpc('review_payment', { p_order: r.id, p_approve: approve, p_reason: approve ? null : reason.trim() });
    setBusy(null);
    if (error) { toast(errText(error.message)); load(); return; }
    toast(approve ? `#TB-${r.order_no}: оплата подтверждена, заказ ушёл на кухню` : `#TB-${r.order_no}: оплата отклонена`);
    setOpen(null); setReason(''); setReceipt(null);
    load();
  };

  const review = (rows ?? []).filter((r) => r.payment_state === 'REVIEW').length;

  return (
    <Panel style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 className="disp" style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>Проверка оплаты (Kaspi)</h2>
        {review > 0 && <Badge color="#C24D00">{review} на проверке</Badge>}
      </div>
      <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 4, lineHeight: 1.4 }}>
        Сверьте сумму и получателя в чеке с приходом в Kaspi. После подтверждения заказ сразу появится у кухни. Неоплаченные заказы отменяются автоматически через установленный срок.
      </div>
      {!rows ? <div style={{ padding: 30, textAlign: 'center' }}><Spinner dark /></div> : !rows.length ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: '#6B6258', fontWeight: 700 }}>Нет заказов, ожидающих оплаты.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
          {rows.map((r) => {
            const p = payOf(r);
            const st = STATE[r.payment_state] ?? ['', '#6B6258'];
            return (
              <div key={r.id} style={{ border: '2px solid #F3EADF', borderRadius: 18, padding: 14 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <b className="disp" style={{ fontSize: 16 }}>#TB-{r.order_no}</b>
                  <Badge color={st[1]}>{st[0]}</Badge>
                  <span style={{ fontWeight: 800, flex: 1, textAlign: 'right', fontSize: 18 }}>{fmt(r.total_kzt)}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#4A423A', marginTop: 6 }}>
                  {branches[r.branch_id] ?? ''} · {r.customer_name ?? 'Клиент'} · {formatPhone(r.contact_phone)} · {dateShort(r.created_at)} {timeHM(r.created_at)}
                  {p && p.attempts > 1 ? ` · чек загружен ${p.attempts} раз` : ''}
                </div>
                {p?.reject_reason && r.payment_state === 'REJECTED' && <div style={{ fontSize: 13, fontWeight: 700, color: '#B3261E', marginTop: 4 }}>Причина: {p.reject_reason}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {p?.receipt_path && <button className="btn" onClick={() => (receipt?.id === r.id ? setReceipt(null) : showReceipt(r))} style={{ minHeight: 44, padding: '0 16px', borderRadius: 22, background: '#F3EADF', fontWeight: 800, fontSize: 13 }}>{receipt?.id === r.id ? 'Скрыть чек' : 'Показать чек'}</button>}
                  <button className="btn" disabled={busy === r.id} onClick={() => decide(r, true)} style={{ minHeight: 44, padding: '0 18px', borderRadius: 22, background: '#2E8B3F', color: '#fff', fontWeight: 800, fontSize: 13 }}>
                    {busy === r.id ? <Spinner /> : r.payment_state === 'REVIEW' ? 'Подтвердить оплату' : 'Подтвердить без чека'}
                  </button>
                  <button className="btn" onClick={() => { setOpen(open === r.id ? null : r.id); setReason(''); }} style={{ minHeight: 44, padding: '0 18px', borderRadius: 22, background: '#FDECEA', color: '#B3261E', fontWeight: 800, fontSize: 13 }}>Отклонить</button>
                </div>
                {open === r.id && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <input className="field" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Причина (её увидит клиент): сумма не совпадает, нет чека…" aria-label="Причина отклонения" style={{ flex: 1, minWidth: 220 }} />
                    <button className="btn" disabled={busy === r.id} onClick={() => decide(r, false)} style={{ minHeight: 48, padding: '0 18px', borderRadius: 24, background: '#B3261E', color: '#fff', fontWeight: 800, fontSize: 13 }}>Отклонить оплату</button>
                  </div>
                )}
                {receipt?.id === r.id && (
                  <div style={{ marginTop: 12 }}>
                    {!receipt.url ? <Spinner dark /> : receipt.pdf ? (
                      <a href={receipt.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 800 }}>Открыть PDF ↗</a>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={receipt.url} alt={`Чек #TB-${r.order_no}`} style={{ maxWidth: '100%', maxHeight: 480, borderRadius: 14, border: '2px solid #F3EADF' }} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------ refunds owed
function Refunds() {
  const [rows, setRows] = useState<RefundRow[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await sb().from('payments').select('order_id,amount_kzt,orders!inner(order_no,contact_phone,cancelled_at,status)')
      .eq('status', 'PAID').neq('method', 'CASH').eq('orders.status', 'CANCELLED').limit(100);
    setRows((data as unknown as RefundRow[]) ?? []);
  }, []);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);
  if (!rows?.length) return null;
  const done = async (r: RefundRow) => {
    const { error } = await sb().rpc('mark_payment_refunded', { p_order: r.order_id });
    toast(error ? errText(error.message) : 'Возврат отмечен выполненным');
    load();
  };
  return (
    <Panel style={{ marginTop: 20, border: '2px solid #FFD9B8' }}>
      <h2 className="disp" style={{ fontSize: 18, fontWeight: 800 }}>Нужен возврат клиентам ({rows.length})</h2>
      <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 4 }}>Заказ отменён после оплаты. Верните деньги в Kaspi на номер клиента и отметьте.</div>
      {rows.map((r) => (
        <div key={r.order_id} style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <b>#TB-{r.orders?.order_no}</b>
          <span style={{ fontWeight: 700, flex: 1 }}>{r.orders ? formatPhone(r.orders.contact_phone) : ''} · {fmt(r.amount_kzt)}</span>
          <button className="btn" onClick={() => done(r)} style={{ minHeight: 44, padding: '0 18px', borderRadius: 22, background: '#141210', color: '#fff', fontWeight: 800, fontSize: 13 }}>Возврат выполнен</button>
        </div>
      ))}
    </Panel>
  );
}

// ------------------------------------------------------------------ settings (admin only)
const QR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function Settings() {
  const [f, setF] = useState<PaymentSettings | null>(null);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    sb().from('payment_settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      const s = (data as PaymentSettings | null) ?? DEFAULT_SETTINGS;
      setF(s);
      setPhone(s.kaspi_phone ? s.kaspi_phone.slice(2) : '');
    });
  }, []);
  if (!f) return <Panel style={{ marginTop: 20, textAlign: 'center' }}><Spinner dark /></Panel>;

  const set = <K extends keyof PaymentSettings>(k: K, v: PaymentSettings[K]) => setF({ ...f, [k]: v });
  const text = (k: 'cash_note' | 'cash_note_kk' | 'kaspi_recipient' | 'kaspi_pay_url' | 'kaspi_note' | 'kaspi_note_kk') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value);

  const uploadQr = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!QR_TYPES.includes(file.type)) return toast('QR: только PNG, JPG или WebP');
    if (file.size > 2 * 1024 * 1024) return toast('QR: файл больше 2 МБ');
    const path = `payment/kaspi-qr-${Date.now()}.${file.type.split('/')[1].replace('jpeg', 'jpg')}`;
    const { error } = await sb().storage.from('product-images').upload(path, file, { contentType: file.type, cacheControl: '3600' });
    if (error) return toast('Не удалось загрузить QR');
    set('kaspi_qr_path', path);
    toast('QR загружен — нажмите «Сохранить»');
  };

  const save = async () => {
    setErr('');
    const url = (f.kaspi_pay_url ?? '').trim();
    if (url && !/^https:\/\/\S+$/.test(url)) return setErr('Ссылка на оплату должна начинаться с https://');
    if (phone && phone.length !== 10) return setErr('Номер Kaspi: 10 цифр после +7');
    const hasKaspiWay = !!(phone || url || f.kaspi_qr_path);
    if (f.kaspi_enabled && !hasKaspiWay) return setErr('Чтобы включить Kaspi, добавьте номер, ссылку или QR');
    if (!f.cash_enabled && !(f.kaspi_enabled && hasKaspiWay)) return setErr('Нужен хотя бы один способ оплаты');
    setBusy(true);
    const nz = (v: string | null) => (v && v.trim() ? v.trim() : null);
    const { error } = await sb().from('payment_settings').update({
      cash_enabled: f.cash_enabled, cash_note: nz(f.cash_note), cash_note_kk: nz(f.cash_note_kk),
      kaspi_enabled: f.kaspi_enabled, kaspi_phone: phone ? '+7' + phone : null, kaspi_recipient: nz(f.kaspi_recipient),
      kaspi_pay_url: url || null, kaspi_qr_path: f.kaspi_qr_path, kaspi_note: nz(f.kaspi_note), kaspi_note_kk: nz(f.kaspi_note_kk),
      pay_timeout_min: Math.min(1440, Math.max(5, Math.round(Number(f.pay_timeout_min) || 30))),
    }).eq('id', 1);
    setBusy(false);
    if (error) return setErr(errText(error.message));
    toast('Настройки оплаты сохранены');
  };

  const qr = qrUrl(f.kaspi_qr_path);

  return (
    <Panel style={{ marginTop: 20 }}>
      <h2 className="disp" style={{ fontSize: 18, fontWeight: 800 }}>Способы оплаты для клиентов</h2>
      <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 4, lineHeight: 1.4 }}>Клиент видит только включённые способы. Изменения применяются сразу.</div>

      <div style={{ borderTop: '2px solid #F3EADF', marginTop: 16, paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Toggle on={f.cash_enabled} onChange={(v) => set('cash_enabled', v)} label="Оплата при получении" />
          <b style={{ fontSize: 15 }}>Наличными или картой при получении</b>
        </div>
        <Label>ПОДСКАЗКА КЛИЕНТУ (РУС, необязательно)</Label><input className="field" value={f.cash_note ?? ''} onChange={text('cash_note')} maxLength={300} placeholder="Например: курьер принимает и карту" />
        <Label>ПОДСКАЗКА КЛИЕНТУ (ҚАЗ, необязательно)</Label><input className="field" value={f.cash_note_kk ?? ''} onChange={text('cash_note_kk')} maxLength={300} />
      </div>

      <div style={{ borderTop: '2px solid #F3EADF', marginTop: 16, paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Toggle on={f.kaspi_enabled} onChange={(v) => set('kaspi_enabled', v)} label="Kaspi" />
          <b style={{ fontSize: 15 }}>Kaspi: перевод / QR / ссылка + чек</b>
        </div>
        <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 6, lineHeight: 1.4 }}>Клиент оплачивает любым из указанных способов, загружает чек, вы проверяете — и заказ уходит на кухню. Заполните хотя бы один способ.</div>

        <Label>НОМЕР KASPI ДЛЯ ПЕРЕВОДА</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 48, borderRadius: 14, border: '2px solid #F3EADF', padding: '0 12px', background: '#fff' }}>
          <span aria-hidden="true" style={{ fontWeight: 800 }}>+7</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" aria-label="Номер Kaspi после +7" placeholder="7XX XXX XX XX" style={{ flex: 1, border: 0, outline: 'none', fontWeight: 800, fontSize: 15, background: 'none', minWidth: 0 }} />
        </div>
        <Label>ИМЯ ПОЛУЧАТЕЛЯ (чтобы клиент сверил)</Label><input className="field" value={f.kaspi_recipient ?? ''} onChange={text('kaspi_recipient')} maxLength={80} placeholder="ИП TOK BURGER / Магжан А." />
        <Label>ССЫЛКА НА ОПЛАТУ (kaspi.kz/pay/… — кнопка «Открыть Kaspi»)</Label><input className="field" value={f.kaspi_pay_url ?? ''} onChange={text('kaspi_pay_url')} maxLength={500} inputMode="url" placeholder="https://pay.kaspi.kz/pay/…" />

        <Label>QR-КОД (картинка из Kaspi Pay)</Label>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR Kaspi" width={96} height={96} style={{ width: 96, height: 96, objectFit: 'contain', borderRadius: 12, border: '2px solid #F3EADF', background: '#fff' }} />
          ) : <span style={{ fontSize: 13, color: '#6B6258', fontWeight: 700 }}>QR не загружен</span>}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={uploadQr} aria-label="Файл QR" />
          <button className="btn" onClick={() => fileRef.current?.click()} style={{ minHeight: 44, padding: '0 16px', borderRadius: 22, background: '#F3EADF', fontWeight: 800, fontSize: 13 }}>{qr ? 'Заменить QR' : 'Загрузить QR'}</button>
          {qr && <button className="btn" onClick={() => set('kaspi_qr_path', null)} style={{ minHeight: 44, padding: '0 16px', borderRadius: 22, background: '#FDECEA', color: '#B3261E', fontWeight: 800, fontSize: 13 }}>Убрать</button>}
        </div>

        <Label>ИНСТРУКЦИЯ КЛИЕНТУ (РУС)</Label><textarea className="field" value={f.kaspi_note ?? ''} onChange={text('kaspi_note')} maxLength={400} rows={2} style={{ height: 'auto', padding: 12, resize: 'vertical' }} placeholder="Переведите точную сумму заказа и загрузите чек" />
        <Label>ИНСТРУКЦИЯ КЛИЕНТУ (ҚАЗ)</Label><textarea className="field" value={f.kaspi_note_kk ?? ''} onChange={text('kaspi_note_kk')} maxLength={400} rows={2} style={{ height: 'auto', padding: 12, resize: 'vertical' }} placeholder="Тапсырыс сомасын дәл аударып, чекті жүктеңіз" />

        <Label>ВРЕМЯ НА ОПЛАТУ, МИН (потом заказ отменится сам)</Label>
        <input className="field" value={String(f.pay_timeout_min)} onChange={(e) => set('pay_timeout_min', Number(e.target.value.replace(/\D/g, '').slice(0, 4)))} inputMode="numeric" style={{ maxWidth: 140 }} />
      </div>

      {err && <div role="alert" style={{ color: '#B3261E', fontWeight: 700, fontSize: 13, marginTop: 12 }}>{err}</div>}
      <button className="btn primary" disabled={busy} onClick={save} style={{ marginTop: 16, width: '100%', height: 52, borderRadius: 26 }}>{busy ? <Spinner /> : 'Сохранить настройки оплаты'}</button>
    </Panel>
  );
}
