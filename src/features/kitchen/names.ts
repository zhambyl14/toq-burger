'use client';
import { useCallback, useEffect, useState } from 'react';
import { useLang } from '@/i18n/LangProvider';
import { sb } from '@/lib/supabase/client';
import type { OrderItemRow } from '@/types/catalog';

interface Pair { ru: string; kk: string | null }
interface Maps { products: Record<string, Pair>; extras: Record<string, Pair> }

/** order_items rows also carry product_id (the snapshot name stays in product_name). */
type ItemWithProduct = OrderItemRow & { product_id?: string | null };

const EMPTY: Maps = { products: {}, extras: {} };

/**
 * Localised names for order lines. order_items.product_name is a Russian snapshot; when the product still exists
 * in the catalog we show its Kazakh name in Kazakh mode, otherwise the snapshot is used.
 */
export function useOrderNames() {
  const { tx } = useLang();
  const [maps, setMaps] = useState<Maps>(EMPTY);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [p, e] = await Promise.all([
        sb().from('products').select('id,name,name_kk'),
        sb().from('product_extras').select('id,name,name_kk'),
      ]);
      if (!alive || p.error || e.error) return;
      const toMap = (rows: { id: string; name: string; name_kk: string | null }[] | null) =>
        Object.fromEntries((rows ?? []).map((r) => [r.id, { ru: r.name, kk: r.name_kk }]));
      setMaps({ products: toMap(p.data as { id: string; name: string; name_kk: string | null }[] | null), extras: toMap(e.data as { id: string; name: string; name_kk: string | null }[] | null) });
    })();
    return () => { alive = false; };
  }, []);

  const item = useCallback((i: OrderItemRow): string => {
    const pid = (i as ItemWithProduct).product_id;
    const hit = pid ? maps.products[pid] : undefined;
    return hit ? tx(i.product_name, hit.kk) : i.product_name;
  }, [maps, tx]);

  const extra = useCallback((x: { id: string; name: string }): string => {
    const hit = maps.extras[x.id];
    return hit ? tx(x.name, hit.kk) : x.name;
  }, [maps, tx]);

  return { item, extra };
}
