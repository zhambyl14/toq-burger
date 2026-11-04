import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { z } from 'zod';
import { toast } from '@/components/ui';
import { errText } from '@/features/admin/transitions';
import { sb } from '@/lib/supabase/client';
import type { OrderStatus } from '@/types/catalog';

/** Statuses in which an order counts as the courier's active load (mirrors public.courier_active_count). */
export const COURIER_ACTIVE_STATUSES: OrderStatus[] = ['ACCEPTED', 'PREPARING', 'READY', 'COURIER_ASSIGNED', 'PICKED_UP', 'ON_THE_WAY'];
/** Statuses in which back office may still change / release the courier (mirrors reassign_courier). */
export const REASSIGNABLE_STATUSES: OrderStatus[] = ['ACCEPTED', 'PREPARING', 'READY', 'COURIER_ASSIGNED'];

export interface ActiveOrderLite { id: string; order_no: number; status: OrderStatus; branch_id: string }

export interface LiveCourier {
  user_id: string;
  display_name: string;
  phone: string | null;
  is_active: boolean;
  is_online: boolean;
  active: ActiveOrderLite[];
  /** ISO time of the last GPS point (admins only; null for moderators or when none). */
  last_gps_at: string | null;
  /** Minutes since that point, computed at load time. */
  gps_age_min: number | null;
}

/** Russian text for the dispatch / courier errors raised by the database. */
export function dispatchErr(message: string | undefined): string {
  const m = message ?? '';
  if (m.includes('HAS_ACTIVE_ORDERS')) return 'Сначала переназначьте его заказы';
  if (m.includes('COURIER_INACTIVE')) return 'Курьер отключён и не может получать заказы';
  if (m.includes('NOT_FOUND')) return 'Заказ не найден';
  if (m.includes('INVALID_TRANSITION')) return 'Статус заказа уже изменился — обновите страницу';
  if (m.includes('FORBIDDEN')) return 'Нет доступа';
  return errText(message);
}

interface CourierBase { user_id: string; display_name: string; is_active: boolean; is_online: boolean }
interface OrderWithCourier extends ActiveOrderLite { courier_id: string | null }

async function loadCouriers(withGps: boolean): Promise<{ couriers: LiveCourier[]; errors: string[] }> {
  const errors: string[] = [];
  const c = await sb().from('couriers').select('user_id,display_name,is_active,is_online').order('created_at');
  if (c.error) errors.push(c.error.message);
  const base = (c.data as CourierBase[] | null) ?? [];
  if (!base.length) return { couriers: [], errors };
  const ids = base.map((x) => x.user_id);

  const [o, p, g] = await Promise.all([
    sb().from('orders').select('id,order_no,status,branch_id,courier_id').in('courier_id', ids).in('status', COURIER_ACTIVE_STATUSES).order('order_no'),
    sb().from('profiles').select('id,phone').in('id', ids),
    withGps
      ? Promise.all(ids.map((id) => sb().from('courier_locations').select('created_at').eq('courier_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()))
      : Promise.resolve([]),
  ]);
  if (o.error) errors.push(o.error.message);
  if (p.error) errors.push(p.error.message);
  g.forEach((r) => { if (r.error) errors.push(r.error.message); });

  const orders = (o.data as OrderWithCourier[] | null) ?? [];
  const phones = new Map(((p.data as { id: string; phone: string }[] | null) ?? []).map((x) => [x.id, x.phone]));
  const now = Date.now();
  const couriers = base.map((b, i) => {
    const at = (g[i]?.data as { created_at: string } | null | undefined)?.created_at ?? null;
    return {
      ...b,
      phone: phones.get(b.user_id) ?? null,
      active: orders.filter((x) => x.courier_id === b.user_id).map(({ id, order_no, status, branch_id }) => ({ id, order_no, status, branch_id })),
      last_gps_at: at,
      gps_age_min: at ? Math.max(0, Math.round((now - new Date(at).getTime()) / 60000)) : null,
    };
  });
  return { couriers, errors };
}

/**
 * Every courier with online flag, active orders and (admins) last GPS time.
 * Refreshes on couriers/orders changes; with GPS also every 30 s.
 */
export function useLiveCouriers(withGps: boolean): { couriers: LiveCourier[]; ready: boolean; reload: () => void } {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [couriers, setCouriers] = useState<LiveCourier[]>([]);
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const errShown = useRef(false);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await loadCouriers(withGps);
      if (!alive) return;
      if (r.errors.length && !errShown.current) { errShown.current = true; toast(dispatchErr(r.errors[0])); }
      if (!r.errors.length) errShown.current = false;
      setCouriers(r.couriers);
      setReady(true);
    })();
    return () => { alive = false; };
  }, [withGps, tick]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => setTick((t) => t + 1), 400); };
    const ch = sb().channel(`live-couriers-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'couriers' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, bump)
      .subscribe();
    return () => { clearTimeout(timer); sb().removeChannel(ch); };
  }, [uid]);

  useEffect(() => {
    if (!withGps) return;
    const i = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(i);
  }, [withGps]);

  return { couriers, ready, reload };
}

// ---------------------------------------------------------------- dispatch_settings

export interface DispatchSettings {
  enabled: boolean;
  batch_enabled: boolean;
  max_batch_size: number;
  ready_window_min: number;
  max_drop_distance_km: number;
  max_bearing_diff_deg: number;
  location_max_age_min: number;
  updated_at: string;
}

export const SETTINGS_COLUMNS = 'enabled,batch_enabled,max_batch_size,ready_window_min,max_drop_distance_km,max_bearing_diff_deg,location_max_age_min,updated_at';

const num = (label: string) => z.number({ error: `${label}: введите число` });

export const dispatchSettingsSchema = z.object({
  enabled: z.boolean(),
  batch_enabled: z.boolean(),
  max_batch_size: num('Размер пачки').int('Только целое число').min(1, 'От 1 до 10').max(10, 'От 1 до 10'),
  ready_window_min: num('Окно готовности').int('Только целое число').min(0, 'От 0 до 60').max(60, 'От 0 до 60'),
  max_drop_distance_km: num('Расстояние').min(0, 'От 0 до 100 км').max(100, 'От 0 до 100 км'),
  max_bearing_diff_deg: num('Направление').int('Только целое число').min(0, 'От 0 до 180').max(180, 'От 0 до 180'),
  location_max_age_min: num('Свежесть GPS').int('Только целое число').min(1, 'От 1 до 240').max(240, 'От 1 до 240'),
});
export type DispatchSettingsInput = z.infer<typeof dispatchSettingsSchema>;

/** Text input -> number (comma allowed); NaN for empty/invalid so zod reports it. */
export function parseNum(s: string): number {
  const t = s.trim().replace(',', '.');
  return t === '' ? Number.NaN : Number(t);
}

/** Plain-Russian sentence describing what the current settings mean. */
export function dispatchSummary(s: DispatchSettingsInput): string {
  if (!s.enabled) {
    return 'Автоназначение выключено: курьеры сами не назначаются. Курьера выбирает администратор или модератор вручную в карточке заказа.';
  }
  const base = `Когда доставка начинает готовиться, система назначает свободного онлайн-курьера: ближайшего по свежему GPS (не старше ${s.location_max_age_min} мин.) или того, кто дольше всех свободен.`;
  if (!s.batch_enabled || s.max_batch_size <= 1) {
    return `${base} Пачки выключены: курьер получает один заказ за раз.`;
  }
  const win = s.ready_window_min === 0 ? 'в одно и то же время' : `с разницей не более ${s.ready_window_min} мин.`;
  return `${base} Курьер получит ещё заказ из того же филиала, если заказы будут готовы ${win} и адреса доставки не дальше ${String(s.max_drop_distance_km).replace('.', ',')} км друг от друга ИЛИ находятся в одном направлении от филиала (разница не более ${s.max_bearing_diff_deg}°). Всего у курьера — не больше ${s.max_batch_size} заказов.`;
}
