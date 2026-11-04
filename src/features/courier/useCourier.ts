'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from '@/components/ui';
import { orderErrL } from '@/features/orders/status';
import type { Lang } from '@/i18n/lang';
import { useLang } from '@/i18n/LangProvider';
import { sb } from '@/lib/supabase/client';
import type { Branch, OrderRow, OrderStatus } from '@/types/catalog';

const noop = () => () => {};

export type CBranch = Pick<Branch, 'id' | 'name' | 'short_name' | 'address' | 'lat' | 'lon'>;

export interface CourierMe { display_name: string; is_online: boolean; is_active: boolean }

/** Orders a courier is responsible for until delivery. */
export const COURIER_ACTIVE: OrderStatus[] = ['ACCEPTED', 'PREPARING', 'READY', 'COURIER_ASSIGNED', 'PICKED_UP', 'ON_THE_WAY'];

export const offlineBlocked = (lang: Lang): string =>
  lang === 'kk' ? 'Белсенді тапсырыстар болғанда желіден шығу мүмкін емес' : 'Нельзя уйти с линии, пока есть активные заказы';

export function courierErr(message: string, lang: Lang): string {
  if (message.includes('HAS_ACTIVE_ORDERS')) return offlineBlocked(lang);
  if (message.includes('BAD_COORDS')) return lang === 'kk' ? 'Координаттар дұрыс емес' : 'Некорректные координаты';
  return orderErrL(message, lang);
}

/**
 * My assigned orders (auto-dispatch), delivery history, branches and profile.
 * `onNew` fires when an order id appears that was not in the previous snapshot (not on the first load).
 */
export function useCourierData(userId: string | undefined, onNew: (fresh: OrderRow[]) => void) {
  const [me, setMe] = useState<CourierMe | null>(null);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [history, setHistory] = useState<OrderRow[]>([]);
  const [branches, setBranches] = useState<CBranch[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const known = useRef<Set<string> | null>(null);
  const failed = useRef(false);
  const onNewRef = useRef(onNew);
  useEffect(() => { onNewRef.current = onNew; }, [onNew]);
  const { t } = useLang();
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  const load = useCallback(async () => {
    if (!userId) return;
    const [c, a, h, b] = await Promise.all([
      sb().from('couriers').select('display_name,is_online,is_active').eq('user_id', userId).maybeSingle(),
      sb().from('orders').select('*, order_items(*)').eq('courier_id', userId).in('status', COURIER_ACTIVE).order('created_at'),
      sb().from('orders').select('*, order_items(*)').eq('courier_id', userId).eq('status', 'DELIVERED').order('delivered_at', { ascending: false }).limit(200),
      sb().from('branches').select('id,name,short_name,address,lat,lon'),
    ]);
    const err = c.error ?? a.error ?? h.error ?? b.error;
    if (err) {
      if (!failed.current) { failed.current = true; toast(tRef.current('Не удалось обновить данные. Проверьте соединение', 'Деректерді жаңарту мүмкін болмады. Байланысты тексеріңіз')); }
      return;
    }
    failed.current = false;
    const rows = (a.data as OrderRow[] | null) ?? [];
    const prev = known.current;
    known.current = new Set(rows.map((r) => r.id));
    setMe((c.data as CourierMe | null) ?? null);
    setOrders(rows);
    setHistory((h.data as OrderRow[] | null) ?? []);
    setBranches((b.data as CBranch[] | null) ?? []);
    if (prev) {
      const fresh = rows.filter((r) => !prev.has(r.id));
      if (fresh.length) onNewRef.current(fresh);
    }
  }, [userId]);

  const scheduleLoad = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 300);
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const first = setTimeout(load, 0);
    const ch = sb().channel('courier-app-' + userId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `courier_id=eq.${userId}` }, scheduleLoad)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'couriers', filter: `user_id=eq.${userId}` }, scheduleLoad)
      .subscribe();
    const onVis = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVis);
    const poll = setInterval(load, 30_000); // safety net if realtime drops
    return () => {
      sb().removeChannel(ch);
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(poll);
      clearTimeout(first);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [userId, load, scheduleLoad]);

  return { me, setMe, orders, history, branches, reload: load };
}

/** While online: asks the server to dispatch waiting orders on mount/going online and every 60 s. */
export function useDispatchPing(online: boolean, reload: () => Promise<void>) {
  const failed = useRef(false);
  const { t } = useLang();
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
  useEffect(() => {
    if (!online) return;
    let alive = true;
    const ping = async () => {
      const { data, error } = await sb().rpc('request_dispatch');
      if (!alive) return;
      if (error) {
        if (!failed.current) { failed.current = true; toast(tRef.current('Не удалось запросить назначение заказов', 'Тапсырыстарды тағайындауды сұрау мүмкін болмады')); }
        return;
      }
      failed.current = false;
      if (typeof data === 'number' && data > 0) void reload();
    };
    const first = setTimeout(ping, 0);
    const iv = setInterval(ping, 60_000);
    return () => { alive = false; clearTimeout(first); clearInterval(iv); };
  }, [online, reload]);
}

export type GpsState = 'idle' | 'watching' | 'denied' | 'unavailable';

/** While ONLINE watches the position and sends at most one point per 10 s. */
export function useCourierGps(enabled: boolean) {
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [watchState, setState] = useState<GpsState>('watching');
  const geoSupported = useSyncExternalStore(noop, () => 'geolocation' in navigator, () => true);
  const state: GpsState = !enabled ? 'idle' : !geoSupported ? 'unavailable' : watchState;
  const lastSent = useRef(0);
  const sendFailed = useRef(false);
  const { t } = useLang();
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  useEffect(() => {
    if (!enabled || !('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const point = { lat: p.coords.latitude, lon: p.coords.longitude };
        setPos(point);
        setState('watching');
        const now = Date.now();
        if (now - lastSent.current < 10_000) return;
        lastSent.current = now;
        void sb().rpc('report_courier_location', { p_lat: point.lat, p_lon: point.lon }).then(({ error }) => {
          if (error) {
            if (!sendFailed.current) { sendFailed.current = true; toast(tRef.current('Не удалось отправить геопозицию', 'Геопозицияны жіберу мүмкін болмады')); }
          } else {
            sendFailed.current = false;
          }
        });
      },
      (err) => setState(err.code === 1 ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return { pos: enabled ? pos : null, state };
}
