export type SupportStatus = 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
export type SupportKind = 'CUSTOMER' | 'COURIER';

export interface SupportReq {
  id: string;
  user_id: string;
  order_id: string | null;
  message: string;
  status: SupportStatus;
  kind: SupportKind;
  requester_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportMsg {
  id: number;
  request_id: string;
  author_id: string;
  author_name: string | null;
  author_role: string | null;
  body: string;
  order_id: string | null;
  created_at: string;
}

export interface OrderInfo { id: string; order_no: number; created_at: string; status: string; total_kzt: number | null }

export interface OrderOption { id: string; order_no: number; created_at: string }

export const STATUS_LABEL: Record<SupportStatus, string> = { OPEN: 'Новое', IN_PROGRESS: 'В работе', CLOSED: 'Закрыто' };
export const STATUS_COLOR: Record<SupportStatus, string> = { OPEN: '#E5360B', IN_PROGRESS: '#0B6EE5', CLOSED: '#6B6258' };
export const KIND_LABEL: Record<SupportKind, string> = { CUSTOMER: 'Клиент', COURIER: 'Курьер' };
export const KIND_COLOR: Record<SupportKind, string> = { CUSTOMER: '#C24D00', COURIER: '#2E8B3F' };

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Администратор', MODERATOR: 'Модератор', OPERATOR: 'Оператор', KITCHEN: 'Кухня',
  COURIER: 'Курьер', CUSTOMER: 'Клиент', SYSTEM: 'Система',
};

export interface Pal {
  card: string; text: string; muted: string; mine: string; mineText: string;
  other: string; otherText: string; line: string; chip: string; chipText: string; selected: string;
}

export function pal(dark: boolean): Pal {
  return dark
    ? { card: '#241F1B', text: '#fff', muted: '#B9AFA3', mine: '#FF6A0A', mineText: '#fff', other: '#3A332D', otherText: '#fff', line: '#3A332D', chip: '#3A332D', chipText: '#fff', selected: '#3A332D' }
    : { card: '#fff', text: '#141210', muted: '#6B6258', mine: '#141210', mineText: '#fff', other: '#F3EADF', otherText: '#141210', line: '#F3EADF', chip: '#FFF1E0', chipText: '#C24D00', selected: '#FFF1E0' };
}

export function supportErr(message: string | undefined): string {
  if (message?.includes('ORDER_NOT_YOURS')) return 'Этот заказ не ваш';
  if (message?.includes('row-level security')) return 'Обращение закрыто или нет доступа';
  return 'Не удалось выполнить действие';
}
