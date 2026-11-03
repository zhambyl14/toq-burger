/**
 * Payment methods. Kaspi QR / online card are disabled until a real provider is connected
 * (see docs: PaymentProvider). Orders are never marked PAID without a verified provider callback.
 * Enable via NEXT_PUBLIC_PAYMENT_METHODS="CASH,KASPI_QR" once the integration exists.
 */
export type PaymentMethodId = 'KASPI_QR' | 'ONLINE' | 'CASH';

const enabled = (process.env.NEXT_PUBLIC_PAYMENT_METHODS || 'CASH').split(',').map((s) => s.trim());

export const PAYMENT_METHODS: { id: PaymentMethodId; label: string; enabled: boolean }[] = [
  { id: 'CASH', label: 'Наличными или картой курьеру / на кассе', enabled: enabled.includes('CASH') },
  { id: 'KASPI_QR', label: 'Kaspi QR', enabled: enabled.includes('KASPI_QR') },
  { id: 'ONLINE', label: 'Онлайн-оплата картой', enabled: enabled.includes('ONLINE') },
];
