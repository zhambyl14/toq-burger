'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { toast } from '@/components/ui';
import { ACTIVE, dateShort, STATUS_LABEL } from '@/features/orders/status';
import { useSession } from '@/hooks/useSession';
import { fmt } from '@/lib/money';
import { sb } from '@/lib/supabase/client';
import { useApp } from '@/stores/app';
import type { Meat, OrderStatus } from '@/types/catalog';
import { showSnack } from './snack';

interface LastItem { product_id: string | null; product_name: string; meat: Meat; quantity: number; extras: { id: string }[] | null }
interface LastOrder { id: string; order_no: number; created_at: string; status: OrderStatus; total_kzt: number; order_items: LastItem[] }

/** «Ваш последний заказ» with one-tap repeat. Only for signed-in users with at least one order. */
export function LastOrderCard() {
  const session = useSession();
  const { products, extras } = useCatalog();
  const add = useApp((s) => s.add);
  const uid = session.user?.id;
  const [loaded, setLoaded] = useState<{ uid: string; order: LastOrder | null } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    (async () => {
      const { data, error } = await sb().from('orders')
        .select('id,order_no,created_at,status,total_kzt,order_items(product_id,product_name,meat,quantity,extras)')
        .eq('user_id', uid).neq('status', 'CANCELLED').order('created_at', { ascending: false }).limit(1);
      if (!alive) return;
      if (error) { toast('Не удалось загрузить последний заказ'); return; }
      setLoaded({ uid, order: ((data ?? []) as unknown as LastOrder[])[0] ?? null });
    })();
    return () => { alive = false; };
  }, [uid]);

  const order = uid && loaded?.uid === uid ? loaded.order : null;
  if (!order) return null;

  const active = ACTIVE.includes(order.status);
  const summary = order.order_items.map((i) => `${i.product_name} × ${i.quantity}`).join(', ');

  const repeat = () => {
    let added = 0;
    let skipped = 0;
    for (const it of order.order_items) {
      const p = products.find((x) => x.id === it.product_id);
      const v = p?.variants.find((x) => x.meat === it.meat);
      if (!p || !v || v.price == null) { skipped += 1; continue; }
      const extraIds = (it.extras ?? []).map((e) => e.id).filter((id) => extras.some((x) => x.id === id && x.groupId === p.extraGroupId));
      add({ productId: p.id, meat: it.meat, qty: it.quantity, extraIds });
      added += 1;
    }
    if (!added) { toast('Эти позиции сейчас недоступны'); return; }
    showSnack(skipped ? `Добавлено ${added}, недоступно ${skipped}` : 'Заказ добавлен в корзину', '/cart', 'В корзину');
  };

  return (
    <section aria-label="Ваш последний заказ" style={{ margin: '20px 16px 0', background: '#fff', borderRadius: 26, padding: 18, boxShadow: '0 10px 28px rgba(120,60,0,.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h2 className="disp" style={{ fontSize: 16, fontWeight: 800 }}>Ваш последний заказ</h2>
        <span style={{ fontSize: 12, fontWeight: 800, color: active ? '#C24D00' : '#6B6258', background: active ? '#FFF1E0' : '#F3EADF', padding: '5px 10px', borderRadius: 12, whiteSpace: 'nowrap' }}>{STATUS_LABEL[order.status]}</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6B6258', marginTop: 4 }}>№{order.order_no} · {dateShort(order.created_at)} · {fmt(order.total_kzt)}</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{summary}</div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button className="btn primary" onClick={repeat} style={{ flex: 1, minHeight: 48, borderRadius: 24, fontSize: 15 }}>Повторить</button>
        {active && (
          <Link href={`/track/${order.id}`} className="btn" style={{ flex: 1, minHeight: 48, borderRadius: 24, background: '#141210', color: '#fff', fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>Отследить</Link>
        )}
      </div>
    </section>
  );
}
