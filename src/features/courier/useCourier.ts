'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

const noop = () => () => {};
import { sb } from '@/lib/supabase/client';
import type { Branch, OrderRow } from '@/types/catalog';

export type CBranch = Pick<Branch, 'id' | 'name' | 'short_name' | 'address' | 'lat' | 'lon'>;

export interface CourierMe { display_name: string; is_online: boolean; is_active: boolean }

export function useCourierData(userId: string | undefined) {
  const [me, setMe] = useState<CourierMe | null>(null);
  const [offers, setOffers] = useState<OrderRow[] | null>(null);
  const [active, setActive] = useState<OrderRow | null | undefined>(undefined);
  const [history, setHistory] = useState<OrderRow[]>([]);
  const [branches, setBranches] = useState<CBranch[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const [c, o, a, h, b] = await Promise.all([
      sb().from('couriers').select('display_name,is_online,is_active').eq('user_id', userId).maybeSingle(),
      sb().rpc('courier_available_orders'),
      sb().from('orders').select('*, order_items(*)').eq('courier_id', userId).in('status', ['COURIER_ASSIGNED', 'PICKED_UP', 'ON_THE_WAY']).order('created_at').limit(1),
      sb().from('orders').select('*, order_items(*)').eq('courier_id', userId).eq('status', 'DELIVERED').order('delivered_at', { ascending: false }).limit(50),
      sb().from('branches').select('id,name,short_name,address,lat,lon'),
    ]);
    setMe((c.data as CourierMe | null) ?? null);
    const offerRows = (o.data as OrderRow[] | null) ?? [];
    if (offerRows.length) {
      const { data: items } = await sb().from('order_items').select('*').in('order_id', offerRows.map((x) => x.id));
      offerRows.forEach((x) => { x.order_items = (items ?? []).filter((i) => i.order_id === x.id); });
    }
    setOffers(offerRows);
    setActive(((a.data as OrderRow[] | null) ?? [])[0] ?? null);
    setHistory((h.data as OrderRow[] | null) ?? []);
    setBranches((b.data as CBranch[] | null) ?? []);
  }, [userId]);

  const scheduleLoad = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 300);
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const first = setTimeout(load, 0);
    const ch = sb().channel('courier-app-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: 'status=eq.READY' }, scheduleLoad)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `courier_id=eq.${userId}` }, scheduleLoad)
      .subscribe();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
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

  return { me, setMe, offers, active, history, branches, reload: load };
}

export type GpsState = 'idle' | 'watching' | 'denied' | 'unavailable';

/** Watches the courier position during an active delivery; sends at most one point per 10 s. */
export function useCourierGps(enabled: boolean) {
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [watchState, setState] = useState<GpsState>('watching');
  const geoSupported = useSyncExternalStore(noop, () => 'geolocation' in navigator, () => true);
  const state: GpsState = !enabled ? 'idle' : !geoSupported ? 'unavailable' : watchState;
  const lastSent = useRef(0);

  useEffect(() => {
    if (!enabled || !('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const point = { lat: p.coords.latitude, lon: p.coords.longitude };
        setPos(point);
        setState('watching');
        const now = Date.now();
        if (now - lastSent.current >= 10_000) {
          lastSent.current = now;
          void sb().rpc('report_courier_location', { p_lat: point.lat, p_lon: point.lon });
        }
      },
      (err) => setState(err.code === 1 ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return { pos, state };
}
