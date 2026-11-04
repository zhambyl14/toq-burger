'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { toast } from '@/components/ui';
import { ACTIVE, dateShortL, statusLabel } from '@/features/orders/status';
import { useSession } from '@/hooks/useSession';
import { useLang } from '@/i18n/LangProvider';
import { sb } from '@/lib/supabase/client';
import { useApp } from '@/stores/app';
import type { Meat, OrderStatus } from '@/types/catalog';
import { BoltMark } from './BoltMark';
import { PriceTag } from './PriceTag';
import { showSnack } from './snack';
import '@/styles/home.css';

interface LastItem { product_id: string | null; product_name: string; meat: Meat; quantity: number; extras: { id: string }[] | null }
interface LastOrder { id: string; order_no: number; created_at: string; status: OrderStatus; total_kzt: number; order_items: LastItem[] }

/** «Ваш последний заказ» with one-tap repeat. Only for signed-in users with at least one order. */
export function LastOrderCard() {
  const session = useSession();
  const { products, extras } = useCatalog();
  const { t, tx, lang, locale } = useLang();
  const add = useApp((s) => s.add);
  const uid = session.user?.id;
  const [loaded, setLoaded] = useState<{ uid: string; order: LastOrder | null } | null>(null);
  // the fetch effect must not re-run on a language switch, but its error toast should use the current language
  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    (async () => {
      const { data, error } = await sb().from('orders')
        .select('id,order_no,created_at,status,total_kzt,order_items(product_id,product_name,meat,quantity,extras)')
        .eq('user_id', uid).neq('status', 'CANCELLED').order('created_at', { ascending: false }).limit(1);
      if (!alive) return;
      if (error) {
        toast(langRef.current === 'kk' ? 'Соңғы тапсырысты жүктеу мүмкін болмады' : 'Не удалось загрузить последний заказ');
        setLoaded({ uid, order: null });
        return;
      }
      setLoaded({ uid, order: ((data ?? []) as unknown as LastOrder[])[0] ?? null });
    })();
    return () => { alive = false; };
  }, [uid]);

  const ready = !!uid && loaded?.uid === uid;
  // reserve the card's height while a signed-in user's last order loads (no layout jump)
  if (uid && !ready) return <div aria-hidden="true" className="hm-last-ph" />;
  const order = ready ? loaded.order : null;
  if (!order) return null;

  const active = ACTIVE.includes(order.status);
  // stored snapshot names are shown in the active language when the product still exists in the catalog
  const itemName = (i: LastItem) => {
    const p = products.find((x) => x.id === i.product_id);
    return p ? tx(p.name, p.nameKk) : i.product_name;
  };
  const summary = order.order_items.map((i) => `${itemName(i)} × ${i.quantity}`).join(', ');

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
    if (!added) { toast(t('Эти позиции сейчас недоступны', 'Бұл позициялар қазір қолжетімсіз')); return; }
    showSnack(
      skipped ? t(`Добавлено ${added}, недоступно ${skipped}`, `Қосылды: ${added}, қолжетімсіз: ${skipped}`) : t('Заказ добавлен в корзину', 'Тапсырыс себетке қосылды'),
      '/cart', t('В корзину', 'Себетке'),
    );
  };

  return (
    <section aria-label={t('Ваш последний заказ', 'Соңғы тапсырысыңыз')} className="hm-outline hm-last">
      <BoltMark size={56} rotate={-6} className="hm-last-bolt" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }} className="hm-last-in">
        <h2 className="disp" style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{t('Ваш последний заказ', 'Соңғы тапсырысыңыз')}</h2>
        <span style={{ fontSize: 12, fontWeight: 800, color: active ? '#C24D00' : '#6B6258', background: active ? '#FFF1E0' : '#F3EADF', padding: '5px 10px', borderRadius: 12, whiteSpace: 'nowrap' }}>{statusLabel(order.status, lang)}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#6B6258', marginTop: 4 }} className="hm-last-in"><span>№{order.order_no} · {dateShortL(order.created_at, locale)} ·</span><PriceTag amount={order.total_kzt} tone="ink" size={12} weight={700} color="#6B6258" /></div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{summary}</div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button className="btn primary" onClick={repeat} style={{ flex: 1, minHeight: 48, borderRadius: 24, fontSize: 15 }}>{t('Повторить', 'Қайталау')}</button>
        {active && (
          <Link href={`/track/${order.id}`} className="btn" style={{ flex: 1, minHeight: 48, borderRadius: 24, background: '#141210', color: '#fff', fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>{t('Отследить', 'Бақылау')}</Link>
        )}
      </div>
    </section>
  );
}
