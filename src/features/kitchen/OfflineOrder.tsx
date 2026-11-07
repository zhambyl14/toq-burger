'use client';
import { useEffect, useMemo, useState } from 'react';
import { Spinner, toast } from '@/components/ui';
import { meatLabel } from '@/features/courier/helpers';
import { orderErrL } from '@/features/orders/status';
import { useLang } from '@/i18n/LangProvider';
import { fmt } from '@/lib/money';
import { sb } from '@/lib/supabase/client';
import type { Meat } from '@/types/catalog';

interface Variant { meat: Meat; price: number }
interface Prod { id: string; name: string; nameKk: string | null; groupId: string | null; variants: Variant[] }
interface Ext { id: string; name: string; nameKk: string | null; price: number; groupId: string }
interface Line { key: string; productId: string; meat: Meat; qty: number; extraIds: string[] }

type Pay = 'CASH' | 'ONLINE' | 'KASPI_QR';

const lineKey = (p: string, m: Meat, e: string[]) => `${p}|${m}|${[...e].sort().join(',')}`;

/** Counter / walk-in order entered by branch staff: accepted at once, paid at the till, never touches delivery. */
export function OfflineOrder({ branchId, onClose, onCreated }: { branchId: string; onClose: () => void; onCreated: () => void }) {
  const { t, tx, lang } = useLang();
  const [prods, setProds] = useState<Prod[] | null>(null);
  const [exts, setExts] = useState<Ext[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [pay, setPay] = useState<Pay>('CASH');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [p, e, a] = await Promise.all([
        sb().from('products').select('id,name,name_kk,extra_group_id,sort_order,product_variants(meat,price_kzt,is_active)').eq('is_active', true).order('sort_order'),
        sb().from('product_extras').select('id,name,name_kk,price_kzt,group_id').eq('is_active', true).order('sort_order'),
        sb().from('product_availability').select('product_id,is_available').eq('branch_id', branchId),
      ]);
      if (!alive) return;
      if (p.error || e.error) { toast(t('Не удалось загрузить меню', 'Мәзірді жүктеу мүмкін болмады')); setProds([]); return; }
      const off = new Set((a.data ?? []).filter((x) => !x.is_available).map((x) => x.product_id as string));
      type PRow = { id: string; name: string; name_kk: string | null; extra_group_id: string | null; product_variants: { meat: Meat; price_kzt: number | null; is_active: boolean }[] };
      setProds(((p.data ?? []) as unknown as PRow[]).filter((x) => !off.has(x.id)).map((x) => ({
        id: x.id, name: x.name, nameKk: x.name_kk, groupId: x.extra_group_id,
        variants: x.product_variants.filter((v) => v.is_active && v.price_kzt != null).map((v) => ({ meat: v.meat, price: v.price_kzt as number })),
      })).filter((x) => x.variants.length));
      setExts(((e.data ?? []) as { id: string; name: string; name_kk: string | null; price_kzt: number; group_id: string }[]).map((x) => ({ id: x.id, name: x.name, nameKk: x.name_kk, price: x.price_kzt, groupId: x.group_id })));
    })();
    return () => { alive = false; };
  }, [branchId, t]);

  const prodOf = (id: string) => prods?.find((x) => x.id === id);
  const unit = (l: Line) => {
    const p = prodOf(l.productId);
    const base = p?.variants.find((v) => v.meat === l.meat)?.price ?? 0;
    return base + l.extraIds.reduce((s, id) => s + (exts.find((x) => x.id === id)?.price ?? 0), 0);
  };
  const total = lines.reduce((s, l) => s + unit(l) * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);

  const add = (productId: string, meat: Meat) => setLines((ls) => {
    const key = lineKey(productId, meat, []);
    return ls.some((l) => l.key === key) ? ls.map((l) => (l.key === key ? { ...l, qty: Math.min(50, l.qty + 1) } : l)) : [...ls, { key, productId, meat, qty: 1, extraIds: [] }];
  });
  const setQty = (key: string, d: number) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0 && l.qty <= 50));
  const toggleExtra = (key: string, id: string) => setLines((ls) => ls.flatMap((l) => {
    if (l.key !== key) return [l];
    const extraIds = l.extraIds.includes(id) ? l.extraIds.filter((x) => x !== id) : [...l.extraIds, id];
    const nk = lineKey(l.productId, l.meat, extraIds);
    return [{ ...l, key: nk, extraIds }];
  }).reduce<Line[]>((acc, l) => { // merge if a line became identical to another one
    const same = acc.find((x) => x.key === l.key);
    if (same) { same.qty = Math.min(50, same.qty + l.qty); return acc; }
    return [...acc, l];
  }, []));

  const submit = async () => {
    if (busy || !lines.length) return;
    if (phone && phone.length !== 10) { toast(t('Телефон: 10 цифр или оставьте пустым', 'Телефон: 10 сан немесе бос қалдырыңыз')); return; }
    setBusy(true);
    const { error } = await sb().rpc('create_offline_order', {
      p_branch: branchId,
      p_items: lines.map((l) => ({ product_id: l.productId, meat: l.meat, quantity: l.qty, extra_ids: l.extraIds })),
      p_payment: pay, p_name: name.trim() || null, p_phone: phone ? '+7' + phone : null, p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) { toast(orderErrL(error.message, lang)); return; }
    toast(t('Офлайн-заказ принят в работу', 'Офлайн тапсырыс жұмысқа қабылданды'));
    onCreated();
    onClose();
  };

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (prods ?? []).filter((p) => !s || p.name.toLowerCase().includes(s) || (p.nameKk ?? '').toLowerCase().includes(s));
  }, [prods, q]);

  const payBtn = (id: Pay, label: string) => (
    <button key={id} className="btn" role="radio" aria-checked={pay === id} onClick={() => setPay(id)}
      style={{ flex: 1, minHeight: 48, borderRadius: 14, fontWeight: 800, fontSize: 13, background: pay === id ? '#141210' : '#F3EADF', color: pay === id ? '#fff' : '#141210' }}>{label}</button>
  );

  return (
    <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,16,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, zIndex: 50 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="off-title" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        style={{ background: '#fff', borderRadius: 24, width: 'min(100%, 980px)', maxHeight: '94dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '2px solid #F3EADF' }}>
          <h2 id="off-title" className="disp" style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>{t('Офлайн-заказ (зал / касса)', 'Офлайн тапсырыс (зал / касса)')}</h2>
          <button className="btn" onClick={onClose} aria-label={t('Закрыть', 'Жабу')} style={{ width: 44, height: 44, borderRadius: '50%', background: '#F3EADF', fontWeight: 800 }}>✕</button>
        </div>
        <div style={{ display: 'flex', flex: 1, minHeight: 0, flexWrap: 'wrap', overflowY: 'auto' }}>
          <div style={{ flex: '1 1 380px', padding: 16, minWidth: 0, overflowY: 'auto', maxHeight: '70dvh' }}>
            <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Поиск по меню', 'Мәзірден іздеу')} aria-label={t('Поиск по меню', 'Мәзірден іздеу')} />
            {!prods ? <div style={{ padding: 40, textAlign: 'center' }}><Spinner dark /></div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {shown.map((p) => (
                  <div key={p.id} style={{ border: '2px solid #F3EADF', borderRadius: 16, padding: '10px 12px' }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{tx(p.name, p.nameKk)}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      {p.variants.map((v) => (
                        <button key={v.meat} className="btn" onClick={() => add(p.id, v.meat)} style={{ minHeight: 44, padding: '0 14px', borderRadius: 14, background: '#FFF1E0', color: '#C24D00', fontWeight: 800, fontSize: 13 }}>
                          + {v.meat !== 'one' ? meatLabel(v.meat, lang) + ' · ' : ''}{fmt(v.price)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {!shown.length && <div style={{ color: '#6B6258', fontWeight: 700, textAlign: 'center', padding: 24 }}>{t('Ничего не найдено', 'Ештеңе табылмады')}</div>}
              </div>
            )}
          </div>

          <div style={{ flex: '1 1 320px', padding: 16, background: '#FBF6EF', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{t('Заказ', 'Тапсырыс')} · {count} {t('шт.', 'дана')}</div>
            {!lines.length && <div style={{ color: '#6B6258', fontWeight: 700, fontSize: 13 }}>{t('Выберите позиции слева.', 'Позицияларды сол жақтан таңдаңыз.')}</div>}
            {lines.map((l) => {
              const p = prodOf(l.productId);
              const group = exts.filter((x) => x.groupId === p?.groupId);
              return (
                <div key={l.key} style={{ background: '#fff', borderRadius: 14, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 14 }}>{p ? tx(p.name, p.nameKk) : ''}{l.meat !== 'one' ? ` · ${meatLabel(l.meat, lang).toLowerCase()}` : ''}</div>
                    <button className="btn" onClick={() => setQty(l.key, -1)} aria-label={t('Меньше', 'Азырақ')} style={{ width: 40, height: 40, borderRadius: 12, background: '#F3EADF', fontWeight: 800 }}>−</button>
                    <b style={{ minWidth: 20, textAlign: 'center' }}>{l.qty}</b>
                    <button className="btn" onClick={() => setQty(l.key, 1)} aria-label={t('Больше', 'Көбірек')} style={{ width: 40, height: 40, borderRadius: 12, background: '#F3EADF', fontWeight: 800 }}>+</button>
                  </div>
                  {group.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {group.map((x) => (
                        <button key={x.id} className="btn" aria-pressed={l.extraIds.includes(x.id)} onClick={() => toggleExtra(l.key, x.id)}
                          style={{ minHeight: 36, padding: '0 10px', borderRadius: 12, fontWeight: 700, fontSize: 12, background: l.extraIds.includes(x.id) ? '#2E8B3F' : '#F3EADF', color: l.extraIds.includes(x.id) ? '#fff' : '#141210' }}>
                          {tx(x.name, x.nameKk)} +{fmt(x.price)}
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 800, color: '#6B6258' }}>{fmt(unit(l) * l.qty)}</div>
                </div>
              );
            })}

            <div style={{ display: 'flex', gap: 8 }}>
              <input className="field" value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder={t('Имя / стол (необязательно)', 'Аты / үстел (міндетті емес)')} aria-label={t('Имя или стол', 'Аты немесе үстел')} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 48, borderRadius: 14, border: '2px solid #E5DACB', padding: '0 12px', background: '#fff' }}>
              <span aria-hidden="true" style={{ fontWeight: 800 }}>+7</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" placeholder={t('Телефон (необязательно)', 'Телефон (міндетті емес)')} aria-label={t('Телефон', 'Телефон')} style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', fontWeight: 800, fontSize: 15, background: 'none' }} />
            </div>
            <input className="field" value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder={t('Комментарий (без лука…)', 'Түсініктеме (пиязсыз…)')} aria-label={t('Комментарий', 'Түсініктеме')} />
            <div role="radiogroup" aria-label={t('Оплата', 'Төлем')} style={{ display: 'flex', gap: 8 }}>
              {payBtn('CASH', t('Наличные', 'Қолма-қол'))}
              {payBtn('ONLINE', t('Карта', 'Карта'))}
              {payBtn('KASPI_QR', 'Kaspi')}
            </div>
            <button className="btn primary" disabled={busy || !lines.length} onClick={submit} style={{ minHeight: 56, borderRadius: 28, fontSize: 16, opacity: lines.length ? 1 : 0.5 }}>
              {busy ? <span className="spinner" /> : `${t('Принять и в работу', 'Қабылдап, жұмысқа беру')} · ${fmt(total)}`}
            </button>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6B6258', lineHeight: 1.4 }}>{t('Оплата принята на месте, заказ сразу идёт на кухню и не попадает в доставку.', 'Төлем орнында алынды, тапсырыс бірден асханаға түседі, жеткізуге кетпейді.')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
