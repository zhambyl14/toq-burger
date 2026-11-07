import type { OrderStatus } from '@/types/catalog';

/** Mirrors public.order_transition_allowed (COURIER_ASSIGNED is set only by courier_accept_order). */
export function nextStatuses(from: OrderStatus, mode: 'DELIVERY' | 'PICKUP'): OrderStatus[] {
  const out: OrderStatus[] = [];
  switch (from) {
    case 'PENDING': out.push('ACCEPTED'); break;
    case 'ACCEPTED': out.push('PREPARING'); break;
    case 'PREPARING': out.push('READY'); break;
    case 'READY': if (mode === 'PICKUP') out.push('DELIVERED'); break;
    case 'COURIER_ASSIGNED': out.push('PICKED_UP'); break;
    case 'PICKED_UP': out.push('ON_THE_WAY'); break;
    case 'ON_THE_WAY': out.push('DELIVERED'); break;
    default: break;
  }
  if (['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COURIER_ASSIGNED'].includes(from)) out.push('CANCELLED');
  return out;
}

export const ALL_STATUSES: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COURIER_ASSIGNED', 'PICKED_UP', 'ON_THE_WAY', 'DELIVERED', 'CANCELLED'];

/** "YYYY-MM-DD" (Almaty) -> ISO instant at local midnight. Almaty is UTC+5 (no DST). */
export function almatyDayStart(d: string): string {
  return new Date(`${d}T00:00:00+05:00`).toISOString();
}

export function almatyToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(new Date());
}

export function addDays(d: string, n: number): string {
  const t = new Date(`${d}T12:00:00+05:00`);
  t.setUTCDate(t.getUTCDate() + n);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(t);
}

const ERR: Record<string, string> = {
  FORBIDDEN: 'Нет доступа', INVALID_TRANSITION: 'Статус уже изменился — обновите', BRANCH_REQUIRED: 'Выберите филиал',
  BAD_ROLE: 'Недопустимая роль', CANNOT_REVOKE_SELF: 'Нельзя снять права администратора с себя', 'duplicate key': 'Такая запись уже существует',
  PAYMENT_NOT_CONFIRMED: 'Оплата заказа ещё не подтверждена', REASON_REQUIRED: 'Укажите причину (минимум 3 символа)',
  INVALID_PAYMENT_STATE: 'Статус оплаты уже изменился — обновите', NO_REQUEST: 'Запроса на отмену нет',
  HAS_ORDERS: 'У филиала есть заказы — удалить нельзя, скройте его', BAD_BRANCH: 'Проверьте название, адрес и координаты',
  NOT_FOUND: 'Запись не найдена', check: 'Проверьте значения полей (ссылка должна начинаться с https://, телефон — +7XXXXXXXXXX)',
};

export function errText(message: string | undefined): string {
  if (!message) return 'Ошибка';
  for (const k of Object.keys(ERR)) if (message.includes(k)) return ERR[k];
  return 'Ошибка: ' + message.slice(0, 120);
}
