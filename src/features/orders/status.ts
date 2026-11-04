import type { OrderStatus } from '@/types/catalog';

export const CUSTOMER_STEPS = ['Заказ принят', 'Передан на кухню', 'Готовится', 'Ожидает курьера', 'Курьер забрал заказ', 'Курьер в пути', 'Заказ доставлен'];
export const PICKUP_STEPS = ['Заказ принят', 'Передан на кухню', 'Готовится', 'Готов к выдаче', 'Выдан'];

/**
 * Customer timeline position. With auto-dispatch the courier is attached already at PREPARING/READY,
 * but the visible steps do not change: READY (with or without a courier) is still "Ожидает курьера".
 */
export function stepIndex(s: OrderStatus, mode: 'DELIVERY' | 'PICKUP'): number {
  if (mode === 'PICKUP') return ({ PENDING: 0, ACCEPTED: 1, PREPARING: 2, READY: 3, DELIVERED: 4 } as Partial<Record<OrderStatus, number>>)[s] ?? 0;
  return ({ PENDING: 0, ACCEPTED: 1, PREPARING: 2, READY: 3, COURIER_ASSIGNED: 3, PICKED_UP: 4, ON_THE_WAY: 5, DELIVERED: 6 } as Partial<Record<OrderStatus, number>>)[s] ?? 0;
}

/** Customer-facing note about an already assigned courier before pickup (nothing else is revealed). */
export function courierNote(s: OrderStatus, mode: 'DELIVERY' | 'PICKUP', hasCourier: boolean): string | null {
  if (mode !== 'DELIVERY' || !hasCourier) return null;
  if (s === 'ACCEPTED' || s === 'PREPARING' || s === 'READY' || s === 'COURIER_ASSIGNED') return 'Курьер назначен и едет в филиал';
  return null;
}

/** Kitchen-facing courier line for an order card. */
export function kitchenCourierText(s: OrderStatus, name: string | null, hasCourier: boolean): string {
  if (!hasCourier) return 'Курьер ещё не назначен — ищем';
  const who = name ? `Курьер ${name}` : 'Курьер';
  if (s === 'READY' || s === 'COURIER_ASSIGNED') return `${who} ждёт/забирает`;
  if (s === 'PICKED_UP' || s === 'ON_THE_WAY') return 'Курьер в пути';
  if (s === 'DELIVERED') return `${who} доставил`;
  return `${who} едет в филиал`;
}

/** Statuses in which kitchen/back office may release an assigned courier. */
export const RELEASABLE: OrderStatus[] = ['ACCEPTED', 'PREPARING', 'READY', 'COURIER_ASSIGNED'];

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
  if (message.includes('NOT_FOUND')) return 'Заказ не найден';
  if (message.includes('COURIER_INACTIVE')) return 'Курьер неактивен';
  if (message.includes('HAS_ACTIVE_ORDERS')) return 'Нельзя уйти с линии: есть активные заказы';
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

// ---------------------------------------------------------------------------------------------
// Kazakh / Russian helpers (language comes from useLang().lang; pass it in, these stay pure).
// ---------------------------------------------------------------------------------------------
import type { Lang } from '@/i18n/lang';

export const STATUS_LABEL_KK: Record<OrderStatus, string> = {
  PENDING: 'Жаңа', ACCEPTED: 'Қабылданды', PREPARING: 'Дайындалуда', READY: 'Дайын', COURIER_ASSIGNED: 'Курьер тағайындалды',
  PICKED_UP: 'Курьер алды', ON_THE_WAY: 'Жолда', DELIVERED: 'Жеткізілді', CANCELLED: 'Бас тартылды',
};
export const CUSTOMER_STEPS_KK = ['Тапсырыс қабылданды', 'Асханаға берілді', 'Дайындалуда', 'Курьерді күтуде', 'Курьер тапсырысты алды', 'Курьер жолда', 'Тапсырыс жеткізілді'];
export const PICKUP_STEPS_KK = ['Тапсырыс қабылданды', 'Асханаға берілді', 'Дайындалуда', 'Беруге дайын', 'Берілді'];

export const statusLabel = (s: OrderStatus, lang: Lang): string => (lang === 'kk' ? STATUS_LABEL_KK[s] : STATUS_LABEL[s]);
export const stepLabels = (mode: 'DELIVERY' | 'PICKUP', lang: Lang): string[] =>
  mode === 'PICKUP' ? (lang === 'kk' ? PICKUP_STEPS_KK : PICKUP_STEPS) : (lang === 'kk' ? CUSTOMER_STEPS_KK : CUSTOMER_STEPS);

export function orderErrL(message: string, lang: Lang): string {
  if (lang !== 'kk') return orderErr(message);
  if (message.includes('INVALID_TRANSITION')) return 'Мәртебе өзгерген — тізімді жаңартыңыз';
  if (message.includes('FORBIDDEN')) return 'Рұқсат жоқ';
  if (message.includes('NOT_FOUND')) return 'Тапсырыс табылмады';
  if (message.includes('COURIER_INACTIVE')) return 'Курьер белсенді емес';
  if (message.includes('HAS_ACTIVE_ORDERS')) return 'Желіден шығу мүмкін емес: белсенді тапсырыстар бар';
  if (message.includes('ALREADY_ON_DELIVERY')) return 'Алдымен ағымдағы жеткізуді аяқтаңыз';
  return 'Қате. Қайтадан көріңіз';
}

export function courierNoteL(s: OrderStatus, mode: 'DELIVERY' | 'PICKUP', hasCourier: boolean, lang: Lang): string | null {
  const ru = courierNote(s, mode, hasCourier);
  return ru && lang === 'kk' ? 'Курьер тағайындалды және филиалға бара жатыр' : ru;
}

export function kitchenCourierTextL(s: OrderStatus, name: string | null, hasCourier: boolean, lang: Lang): string {
  if (lang !== 'kk') return kitchenCourierText(s, name, hasCourier);
  if (!hasCourier) return 'Курьер әлі тағайындалмады — іздеудеміз';
  const who = name ? `Курьер ${name}` : 'Курьер';
  if (s === 'READY' || s === 'COURIER_ASSIGNED') return `${who} күтіп тұр/алып жатыр`;
  if (s === 'PICKED_UP' || s === 'ON_THE_WAY') return 'Курьер жолда';
  if (s === 'DELIVERED') return `${who} жеткізді`;
  return `${who} филиалға бара жатыр`;
}

/** Time/date formatting in Almaty time for the chosen locale (useLang().locale). */
export function timeHML(iso: string | null, locale: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Almaty', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
export function dateShortL(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Almaty', day: 'numeric', month: 'short' }).format(new Date(iso));
}
