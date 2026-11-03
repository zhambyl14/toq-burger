import type { OrderStatus } from '@/types/catalog';

export const CUSTOMER_STEPS = ['Заказ принят', 'Передан на кухню', 'Готовится', 'Ожидает курьера', 'Курьер забрал заказ', 'Курьер в пути', 'Заказ доставлен'];
export const PICKUP_STEPS = ['Заказ принят', 'Передан на кухню', 'Готовится', 'Готов к выдаче', 'Выдан'];

export function stepIndex(s: OrderStatus, mode: 'DELIVERY' | 'PICKUP'): number {
  if (mode === 'PICKUP') return ({ PENDING: 0, ACCEPTED: 1, PREPARING: 2, READY: 3, DELIVERED: 4 } as Record<string, number>)[s] ?? 0;
  return ({ PENDING: 0, ACCEPTED: 1, PREPARING: 2, READY: 3, COURIER_ASSIGNED: 3, PICKED_UP: 4, ON_THE_WAY: 5, DELIVERED: 6 } as Record<string, number>)[s] ?? 0;
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Новый', ACCEPTED: 'Принят', PREPARING: 'Готовится', READY: 'Готов', COURIER_ASSIGNED: 'Курьер назначен',
  PICKED_UP: 'Курьер забрал', ON_THE_WAY: 'В пути', DELIVERED: 'Доставлен', CANCELLED: 'Отменён',
};

export const STATUS_COLOR: Record<OrderStatus, string> = {
  PENDING: '#E5360B', ACCEPTED: '#0B6EE5', PREPARING: '#C24D00', READY: '#2E8B3F', COURIER_ASSIGNED: '#7B3FE4',
  PICKED_UP: '#7B3FE4', ON_THE_WAY: '#7B3FE4', DELIVERED: '#6B6258', CANCELLED: '#B3A89B',
};

export const ACTIVE: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COURIER_ASSIGNED', 'PICKED_UP', 'ON_THE_WAY'];

export function orderErr(message: string): string {
  if (message.includes('INVALID_TRANSITION')) return 'Статус уже изменился — обновите список';
  if (message.includes('FORBIDDEN')) return 'Нет доступа';
  if (message.includes('ALREADY_ON_DELIVERY')) return 'Сначала завершите текущую доставку';
  return 'Ошибка. Попробуйте ещё раз';
}

export function timeHM(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function dateShort(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: 'numeric', month: 'short' }).format(new Date(iso));
}
