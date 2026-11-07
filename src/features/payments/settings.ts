'use client';
import { useCallback, useEffect, useState } from 'react';
import { sb } from '@/lib/supabase/client';
import type { PaymentState } from '@/types/catalog';

/** Row of public.payment_settings (managed by the admin: Admin → Оплата). */
export interface PaymentSettings {
  cash_enabled: boolean;
  cash_note: string | null;
  cash_note_kk: string | null;
  kaspi_enabled: boolean;
  kaspi_phone: string | null;
  kaspi_recipient: string | null;
  kaspi_pay_url: string | null;
  kaspi_qr_path: string | null;
  kaspi_note: string | null;
  kaspi_note_kk: string | null;
  pay_timeout_min: number;
}

export type MethodId = 'CASH' | 'KASPI_QR';

export const DEFAULT_SETTINGS: PaymentSettings = {
  cash_enabled: true, cash_note: null, cash_note_kk: null,
  kaspi_enabled: false, kaspi_phone: null, kaspi_recipient: null, kaspi_pay_url: null, kaspi_qr_path: null,
  kaspi_note: null, kaspi_note_kk: null, pay_timeout_min: 30,
};

/** Kaspi can be offered only when the admin gave at least one way to pay (phone, link or QR). */
export function kaspiUsable(s: PaymentSettings): boolean {
  return s.kaspi_enabled && !!(s.kaspi_phone || s.kaspi_pay_url || s.kaspi_qr_path);
}

export function enabledMethods(s: PaymentSettings): MethodId[] {
  const out: MethodId[] = [];
  if (s.cash_enabled) out.push('CASH');
  if (kaspiUsable(s)) out.push('KASPI_QR');
  return out;
}

/** null while loading. On error falls back to defaults (cash only), the server still enforces the real rules. */
export function usePaymentSettings(): PaymentSettings | null {
  const [s, setS] = useState<PaymentSettings | null>(null);
  useEffect(() => {
    let alive = true;
    sb().from('payment_settings').select('*').eq('id', 1).maybeSingle().then(({ data, error }) => {
      if (alive) setS(error || !data ? DEFAULT_SETTINGS : (data as PaymentSettings));
    });
    return () => { alive = false; };
  }, []);
  return s;
}

/** Public URL of the Kaspi QR image (stored by the admin in the public product-images bucket). */
export function qrUrl(path: string | null): string | null {
  if (!path) return null;
  return sb().storage.from('product-images').getPublicUrl(path).data.publicUrl;
}

export interface PaymentRow {
  id: string;
  order_id: string;
  method: 'KASPI_QR' | 'ONLINE' | 'CASH';
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  amount_kzt: number;
  receipt_path: string | null;
  receipt_uploaded_at: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  attempts: number;
}

export function usePayment(orderId: string, refreshKey: string) {
  const [row, setRow] = useState<PaymentRow | null>(null);
  const load = useCallback(async () => {
    const { data } = await sb().from('payments').select('id,order_id,method,status,amount_kzt,receipt_path,receipt_uploaded_at,reviewed_by_name,reviewed_at,reject_reason,attempts').eq('order_id', orderId).maybeSingle();
    setRow((data as PaymentRow | null) ?? null);
  }, [orderId]);
  // refreshKey = order.payment_state: reload the payment row whenever the order's payment state changes (realtime)
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load, refreshKey]);
  return { payment: row, reload: load };
}

export const PAY_STATE_LABEL: Record<PaymentState, [string, string]> = {
  NOT_REQUIRED: ['Оплата при получении', 'Алғанда төленеді'],
  AWAITING_RECEIPT: ['Ждём оплату и чек', 'Төлем мен чекті күтудеміз'],
  REVIEW: ['Чек на проверке', 'Чек тексеруде'],
  CONFIRMED: ['Оплачено', 'Төленді'],
  REJECTED: ['Оплата отклонена', 'Төлем қабылданбады'],
};

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

/** Upload the receipt to the private bucket (own folder) and hand it to the back office for review. */
export async function uploadReceipt(userId: string, orderId: string, file: File): Promise<'OK' | 'TYPE' | 'SIZE' | 'FAIL'> {
  if (!ALLOWED_TYPES.includes(file.type)) return 'TYPE';
  if (file.size > MAX_RECEIPT_BYTES) return 'SIZE';
  const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1].replace('jpeg', 'jpg');
  const path = `${userId}/${orderId.slice(0, 8)}-${Date.now()}.${ext}`;
  const up = await sb().storage.from('receipts').upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return 'FAIL';
  const { error } = await sb().rpc('submit_payment_receipt', { p_order: orderId, p_path: path });
  return error ? 'FAIL' : 'OK';
}
