'use client';
import { useEffect, useRef, useState } from 'react';
import { Spinner, toast } from '@/components/ui';
import { useLang } from '@/i18n/LangProvider';
import { sb } from '@/lib/supabase/client';

interface Item { id: string; name: string; nameKk: string | null; available: boolean }

export function StopList({ branchId, onClose }: { branchId: string; onClose: () => void }) {
  const { t, tx } = useLang();
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [p, a] = await Promise.all([
        sb().from('products').select('id,name,name_kk,sort_order').eq('is_active', true).order('sort_order'),
        sb().from('product_availability').select('product_id,is_available').eq('branch_id', branchId),
      ]);
      if (!alive) return;
      if (p.error || a.error) { toast(tRef.current('Не удалось загрузить стоп-лист', 'Стоп-тізімді жүктеу мүмкін болмады')); setItems([]); return; }
      const off = new Set((a.data ?? []).filter((x) => !x.is_available).map((x) => x.product_id as string));
      setItems((p.data ?? []).map((x) => ({ id: x.id as string, name: x.name as string, nameKk: (x.name_kk as string | null) ?? null, available: !off.has(x.id as string) })));
    })();
    return () => { alive = false; };
  }, [branchId]);

  const toggle = async (it: Item) => {
    setBusy(it.id);
    const { error } = await sb().from('product_availability').upsert({ branch_id: branchId, product_id: it.id, is_available: !it.available });
    setBusy(null);
    if (error) return toast(t('Не удалось изменить стоп-лист', 'Стоп-тізімді өзгерту мүмкін болмады'));
    setItems((xs) => xs?.map((x) => (x.id === it.id ? { ...x, available: !x.available } : x)) ?? null);
    const n = tx(it.name, it.nameKk);
    toast(it.available ? `${n}: ${t('в стоп-листе', 'стоп-тізімде')}` : `${n}: ${t('снова в продаже', 'қайтадан сатылымда')}`);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={t('Стоп-лист', 'Стоп-тізім')} onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,.55)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(420px, 100%)', height: '100%', background: '#fff', padding: 20, overflowY: 'auto', animation: 'fade .2s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="disp" style={{ fontSize: 20, fontWeight: 800 }}>{t('Стоп-лист', 'Стоп-тізім')}</div>
          <button className="btn" onClick={onClose} aria-label={t('Закрыть', 'Жабу')} style={{ width: 44, height: 44, borderRadius: 14, background: '#F3EADF', fontWeight: 800, fontSize: 18 }}>✕</button>
        </div>
        <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 6 }}>{t('Отключённые позиции нельзя заказать в этом филиале.', 'Өшірілген позицияларды осы филиалда тапсырыс беруге болмайды.')}</div>
        {!items ? <div style={{ marginTop: 20 }}><Spinner dark /></div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
            {items.map((it) => (
              <button key={it.id} className="btn" role="switch" aria-checked={it.available} disabled={busy === it.id} onClick={() => toggle(it)}
                style={{ minHeight: 52, borderRadius: 16, background: it.available ? '#fff' : '#FFF1E0', border: '2px solid #F3EADF', display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', textAlign: 'left' }}>
                <span style={{ flex: 1, fontWeight: 800, fontSize: 14, textDecoration: it.available ? 'none' : 'line-through' }}>{tx(it.name, it.nameKk)}</span>
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
