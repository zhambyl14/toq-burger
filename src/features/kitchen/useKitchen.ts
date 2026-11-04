'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { sb } from '@/lib/supabase/client';
import { ACTIVE } from '@/features/orders/status';
import type { Branch, OrderRow } from '@/types/catalog';
import { beep } from './sound';

export type KBranch = Pick<Branch, 'id' | 'short_name' | 'name'>;
export interface KCourier { name: string; online: boolean }

/** Start of the current day in Almaty (UTC+5), as ISO. */
export function startOfAlmatyDay(now = new Date()): string {
  const shifted = new Date(now.getTime() + 5 * 3600_000);
  const utcMidnight = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(utcMidnight - 5 * 3600_000).toISOString();
}

/** Branches the signed-in staff member works at (ADMIN: all). */
export function useStaffBranches(userId: string | undefined, isAdmin: boolean) {
  const [branches, setBranches] = useState<KBranch[] | null>(null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      let q = sb().from('branches').select('id,short_name,name').order('sort_order');
      if (!isAdmin) {
        const { data: roles } = await sb().from('user_roles').select('branch_id').eq('user_id', userId).in('role', ['KITCHEN', 'OPERATOR']);
        const ids = Array.from(new Set((roles ?? []).map((r) => r.branch_id as string).filter(Boolean)));
        if (!ids.length) { if (alive) setBranches([]); return; }
        q = q.in('id', ids);
      }
      const { data } = await q;
      if (alive) setBranches((data as KBranch[]) ?? []);
    })();
    return () => { alive = false; };
  }, [userId, isAdmin]);
  return branches;
}

export function useBranchOrders(branchId: string | null, muted: boolean) {
  // keyed by branch so switching tabs shows a loader instead of the previous branch orders
  const [data, setData] = useState<{ b: string; rows: OrderRow[] } | null>(null);
  const orders = data && data.b === branchId ? data.rows : null;
  const [couriers, setCouriers] = useState<Record<string, KCourier>>({});
  const mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    const [activeRes, doneRes] = await Promise.all([
      sb().from('orders').select('*, order_items(*)')
        .eq('branch_id', branchId)
        .in('status', ACTIVE)
        .order('created_at', { ascending: true })
        .limit(1000),
      sb().from('orders').select('*, order_items(*)')
        .eq('branch_id', branchId)
        .in('status', ['DELIVERED', 'CANCELLED'])
        .gte('created_at', startOfAlmatyDay())
        .order('created_at', { ascending: false })
        .limit(200),
    ]);
    if (activeRes.error || doneRes.error) return;
    const byId = new Map<string, OrderRow>();
    for (const o of [...((activeRes.data as OrderRow[]) ?? []), ...((doneRes.data as OrderRow[]) ?? [])]) byId.set(o.id, o);
    const rows = Array.from(byId.values()).sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
    const ids = Array.from(new Set(rows.map((o) => o.courier_id).filter((x): x is string => !!x)));
    if (!ids.length) { setCouriers({}); setData({ b: branchId, rows }); return; }
    const { data: cs, error } = await sb().from('couriers').select('user_id,display_name,is_online').in('user_id', ids);
    // names are loaded before the rows are shown, so a freshly assigned courier never flashes as "unknown"
    if (!error) setCouriers(Object.fromEntries((cs ?? []).map((c) => [c.user_id as string, { name: c.display_name as string, online: !!c.is_online }])));
    setData({ b: branchId, rows });
  }, [branchId]);

  const scheduleLoad = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 250);
  }, [load]);

  useEffect(() => {
    if (!branchId) return;
    const first = setTimeout(load, 0);
    const ch = sb().channel('kitchen-' + branchId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` }, () => {
        if (!mutedRef.current) beep();
        scheduleLoad();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` }, scheduleLoad)
      .subscribe();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    const poll = setInterval(load, 60_000); // safety net if the websocket drops
    return () => {
      sb().removeChannel(ch);
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(poll);
      clearTimeout(first);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [branchId, load, scheduleLoad]);

  return { orders, couriers, reload: load };
}
