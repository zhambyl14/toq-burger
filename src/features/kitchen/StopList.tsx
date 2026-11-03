'use client';
import { useEffect, useState } from 'react';
import { Spinner, toast } from '@/components/ui';
import { sb } from '@/lib/supabase/client';

interface Item { id: string; name: string; available: boolean }

export function StopList({ branchId, onClose }: { branchId: string; onClose: () => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [p, a] = await Promise.all([
        sb().from('products').select('id,name,sort_order').eq('is_active', true).order('sort_order'),
        sb().from('product_availability').select('product_id,is_available').eq('branch_id', branchId),
      ]);
      if (!alive) return;
      const off = new Set((a.data ?? []).filter((x) => !x.is_available).map((x) => x.product_id as string));
      setItems((p.data ?? []).map((x) => ({ id: x.id as string, name: x.name as string, available: !off.has(x.id as string) })));
    })();
    return () => { alive = false; };
  }, [branchId]);

  const toggle = async (it: Item) => {
    setBusy(it.id);
    const { error } = await sb().from('product_availability').upsert({ branch_id: branchId, product_id: it.id, is_available: !it.available });
    setBusy(null);
    if (error) return toast('Не удалось изменить стоп-лист');
    setItems((xs) => xs?.map((x) => (x.id === it.id ? { ...x, available: !x.available } : x)) ?? null);
    toast(it.available ? `${it.name}: в стоп-листе` : `${it.name}: снова в продаже`);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Стоп-лист" onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,.55)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(420px, 100%)', height: '100%', background: '#fff', padding: 20, overflowY: 'auto', animation: 'fade .2s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="disp" style={{ fontSize: 20, fontWeight: 800 }}>Стоп-лист</div>
          <button className="btn" onClick={onClose} aria-label="Закрыть" style={{ width: 44, height: 44, borderRadius: 14, background: '#F3EADF', fontWeight: 800, fontSize: 18 }}>✕</button>
        </div>
        <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 6 }}>Отключённые позиции нельзя заказать в этом филиале.</div>
        {!items ? <div style={{ marginTop: 20 }}><Spinner dark /></div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
            {items.map((it) => (
              <button key={it.id} className="btn" role="switch" aria-checked={it.available} disabled={busy === it.id} onClick={() => toggle(it)}
                style={{ minHeight: 52, borderRadius: 16, background: it.available ? '#fff' : '#FFF1E0', border: '2px solid #F3EADF', display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', textAlign: 'left' }}>
                <span style={{ flex: 1, fontWeight: 800, fontSize: 14, textDecoration: it.available ? 'none' : 'line-through' }}>{it.name}</span>
                <span style={{ width: 48, height: 28, borderRadius: 14, background: it.available ? '#2E8B3F' : '#CFC4B5', position: 'relative', flex: 'none' }}>
                  <span style={{ position: 'absolute', top: 3, left: it.available ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
