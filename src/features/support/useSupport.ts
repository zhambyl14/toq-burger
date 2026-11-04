'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui';
import { useSession } from '@/hooks/useSession';
import { sb } from '@/lib/supabase/client';
import { supportErr, trNow, type OrderInfo, type OrderOption, type SupportKind, type SupportMsg, type SupportReq, type SupportStatus } from './types';

export interface ThreadFilters { status: 'all' | SupportStatus; kind: 'all' | SupportKind }

interface ListState { rows: SupportReq[]; phones: Record<string, string>; orderNos: Record<string, number> }
let channelSeq = 0;

/** Support threads: 'mine' = own threads, 'all' = every thread (admin / moderator). */
export function useThreads(scope: 'mine' | 'all', filters: ThreadFilters) {
  const uid = useSession().user?.id;
  const { status, kind } = filters;
  const [state, setState] = useState<ListState | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!uid) return;
    const my = ++seq.current;
    let q = sb().from('support_requests').select('*').order('updated_at', { ascending: false }).limit(200);
    if (scope === 'mine') q = q.eq('user_id', uid);
    if (status !== 'all') q = q.eq('status', status);
    if (kind !== 'all') q = q.eq('kind', kind);
    const { data, error } = await q;
    if (my !== seq.current) return;
    if (error) {
      toast(trNow('Не удалось загрузить обращения', 'Өтініштерді жүктеу мүмкін болмады'));
      setState((s) => s ?? { rows: [], phones: {}, orderNos: {} });
      return;
    }
    const rows = (data ?? []) as SupportReq[];
    const uids = Array.from(new Set(rows.map((r) => r.user_id)));
    const oids = Array.from(new Set(rows.map((r) => r.order_id).filter((x): x is string => !!x)));
    const [p, o] = await Promise.all([
      scope === 'all' && uids.length ? sb().from('profiles').select('id,phone').in('id', uids) : Promise.resolve({ data: [], error: null }),
      oids.length ? sb().from('orders').select('id,order_no').in('id', oids) : Promise.resolve({ data: [], error: null }),
    ]);
    if (my !== seq.current) return;
    if (p.error || o.error) toast(trNow('Не удалось загрузить данные заказов или клиентов', 'Тапсырыстар немесе клиенттер деректерін жүктеу мүмкін болмады'));
    const phones: Record<string, string> = {};
    ((p.data ?? []) as { id: string; phone: string }[]).forEach((x) => { phones[x.id] = x.phone; });
    const orderNos: Record<string, number> = {};
    ((o.data ?? []) as { id: string; order_no: number }[]).forEach((x) => { orderNos[x.id] = x.order_no; });
    setState({ rows, phones, orderNos });
  }, [uid, scope, status, kind]);

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!uid) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sched = () => {
      clearTimeout(timer);
      timer = setTimeout(() => loadRef.current(), 300);
    };
    const filter = scope === 'mine' ? { filter: `user_id=eq.${uid}` } : {};
    const ch = sb().channel(`support-list-${scope}-${uid}-${++channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_requests', ...filter }, sched)
      .subscribe();
    return () => {
      clearTimeout(timer);
      sb().removeChannel(ch);
    };
  }, [uid, scope]);

  return { rows: state?.rows ?? null, phones: state?.phones ?? {}, orderNos: state?.orderNos ?? {}, reload: load };
}

interface ThreadState { id: string; req: SupportReq | null; msgs: SupportMsg[]; orderNo: number | null }

/** One thread with live updates of its messages and status. */
export function useThread(requestId: string) {
  const uid = useSession().user?.id;
  const [data, setData] = useState<ThreadState | null>(null);

  const load = useCallback(async () => {
    const [r, m] = await Promise.all([
      sb().from('support_requests').select('*').eq('id', requestId).maybeSingle(),
      sb().from('support_messages').select('*').eq('request_id', requestId).order('created_at').order('id'),
    ]);
    if (r.error || m.error) {
      toast(trNow('Не удалось загрузить переписку', 'Хат алмасуды жүктеу мүмкін болмады'));
      setData((s) => s ?? { id: requestId, req: null, msgs: [], orderNo: null });
      return;
    }
    const req = (r.data as SupportReq | null) ?? null;
    let orderNo: number | null = null;
    if (req?.order_id) {
      const o = await sb().from('orders').select('order_no').eq('id', req.order_id).maybeSingle();
      if (o.error) toast(trNow('Не удалось загрузить номер заказа', 'Тапсырыс нөмірін жүктеу мүмкін болмады'));
      else orderNo = (o.data?.order_no as number | undefined) ?? null;
    }
    setData({ id: requestId, req, msgs: (m.data ?? []) as SupportMsg[], orderNo });
  }, [requestId]);

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sched = () => {
      clearTimeout(timer);
      timer = setTimeout(() => loadRef.current(), 200);
    };
    const ch = sb().channel(`support-thread-${requestId}-${++channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_messages', filter: `request_id=eq.${requestId}` }, sched)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_requests', filter: `id=eq.${requestId}` }, sched)
      .subscribe();
    return () => {
      clearTimeout(timer);
      sb().removeChannel(ch);
    };
  }, [requestId]);

  const send = useCallback(async (body: string, orderId?: string): Promise<boolean> => {
    if (!uid) return false;
    const { error } = await sb().from('support_messages').insert({ request_id: requestId, author_id: uid, body, ...(orderId ? { order_id: orderId } : {}) });
    if (error) { toast(supportErr(error.message)); return false; }
    await load();
    return true;
  }, [uid, requestId, load]);

  const current = data && data.id === requestId ? data : null;
  return { loading: !current, req: current?.req ?? null, msgs: current?.msgs ?? [], orderNo: current?.orderNo ?? null, send, reload: load, uid };
}

export async function setThreadStatus(id: string, status: SupportStatus): Promise<boolean> {
  const { error } = await sb().from('support_requests').update({ status }).eq('id', id);
  if (error) { toast(supportErr(error.message)); return false; }
  return true;
}

export async function createThread(input: { userId: string; message: string; orderId: string | null; kind: SupportKind }): Promise<string | null> {
  const { data, error } = await sb().from('support_requests')
    .insert({ user_id: input.userId, message: input.message, order_id: input.orderId, kind: input.kind })
    .select('id').single();
  if (error) { toast(trNow('Не удалось отправить обращение', 'Өтінішті жіберу мүмкін болмады')); return null; }
  return (data as { id: string }).id;
}

/** Recent orders of the current user (as customer) or orders the courier delivers/delivered. */
export function useMyOrders(kind: SupportKind): OrderOption[] {
  const uid = useSession().user?.id;
  const [list, setList] = useState<OrderOption[]>([]);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    const t = setTimeout(async () => {
      const col = kind === 'COURIER' ? 'courier_id' : 'user_id';
      const { data, error } = await sb().from('orders').select('id,order_no,created_at').eq(col, uid).order('created_at', { ascending: false }).limit(15);
      if (!alive) return;
      if (error) { toast(trNow('Не удалось загрузить заказы', 'Тапсырыстарды жүктеу мүмкін болмады')); return; }
      setList((data ?? []) as OrderOption[]);
    }, 0);
    return () => { alive = false; clearTimeout(t); };
  }, [uid, kind]);
  return list;
}

/** Order cards for messages: loads orders by id (RLS: requester and backoffice). */
export function useOrderInfos(ids: string[]): Record<string, OrderInfo> {
  const key = Array.from(new Set(ids)).sort().join(',');
  const [map, setMap] = useState<Record<string, OrderInfo>>({});
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const t = setTimeout(async () => {
      const { data, error } = await sb().from('orders').select('id,order_no,created_at,status,total_kzt').in('id', key.split(','));
      if (!alive) return;
      if (error) { toast(trNow('Не удалось загрузить данные заказа', 'Тапсырыс деректерін жүктеу мүмкін болмады')); return; }
      const next: Record<string, OrderInfo> = {};
      ((data ?? []) as OrderInfo[]).forEach((o) => { next[o.id] = o; });
      setMap((m) => ({ ...m, ...next }));
    }, 0);
    return () => { alive = false; clearTimeout(t); };
  }, [key]);
  return map;
}

export async function findOrderByNo(no: number): Promise<OrderOption | null> {
  const { data, error } = await sb().from('orders').select('id,order_no,created_at').eq('order_no', no).maybeSingle();
  if (error) { toast(trNow('Не удалось найти заказ', 'Тапсырысты іздеу мүмкін болмады')); return null; }
  if (!data) { toast(trNow('Заказ не найден', 'Тапсырыс табылмады')); return null; }
  return data as OrderOption;
}
