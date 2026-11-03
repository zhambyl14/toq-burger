'use client';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { Drawer, Label, PageHead, Panel, TableWrap, Toggle } from '@/components/admin/kit';
import { Spinner, toast } from '@/components/ui';
import { almatyDayStart, errText } from '@/features/admin/transitions';
import { dateShort } from '@/features/orders/status';
import { fmt } from '@/lib/money';
import { sb } from '@/lib/supabase/client';

interface Promo {
  id: string; code: string; description: string | null; percent_off: number | null; amount_off_kzt: number | null;
  min_subtotal_kzt: number; starts_at: string | null; ends_at: string | null; max_uses: number | null; used_count: number; is_active: boolean;
}

const promoSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,20}$/, 'Код: 3–20 латинских букв/цифр'),
  description: z.string().trim().max(200),
  kind: z.enum(['percent', 'amount']),
  value: z.string().regex(/^\d{1,7}$/, 'Укажите размер скидки'),
  min_subtotal_kzt: z.string().regex(/^\d{0,7}$/),
  starts: z.string(),
  ends: z.string(),
  max_uses: z.string().regex(/^\d{0,7}$/),
}).refine((d) => d.kind === 'amount' || (Number(d.value) >= 1 && Number(d.value) <= 100), { message: 'Процент: от 1 до 100' })
  .refine((d) => d.kind === 'percent' || Number(d.value) > 0, { message: 'Сумма скидки > 0' })
  .refine((d) => !d.starts || !d.ends || d.ends >= d.starts, { message: 'Дата окончания раньше начала' });

type Form = z.input<typeof promoSchema>;
const EMPTY: Form = { code: '', description: '', kind: 'percent', value: '', min_subtotal_kzt: '0', starts: '', ends: '', max_uses: '' };
const toDay = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(new Date(iso)) : '');

export default function AdminPromotions() {
  const [list, setList] = useState<Promo[] | null>(null);
  const [edit, setEdit] = useState<Promo | 'new' | null>(null);

  const load = useCallback(async () => {
    const { data } = await sb().from('promotions').select('*').order('code');
    setList((data as Promo[]) ?? []);
  }, []);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const toggle = async (p: Promo, v: boolean) => {
    const { error } = await sb().from('promotions').update({ is_active: v }).eq('id', p.id);
    if (error) return toast(errText(error.message));
    toast(v ? 'Промокод включён' : 'Промокод выключен');
    load();
  };
  const remove = async (p: Promo) => {
    if (!confirm(`Удалить промокод ${p.code}?`)) return;
    const { error } = await sb().from('promotions').delete().eq('id', p.id);
    if (error) return toast(errText(error.message));
    toast('Удалено');
    load();
  };

  return (
    <>
      <PageHead title="Промокоды">
        <button className="btn primary" onClick={() => setEdit('new')} style={{ height: 44, padding: '0 20px', borderRadius: 22 }}>+ Новый промокод</button>
      </PageHead>
      <TableWrap>
        <thead><tr><th>Код</th><th>Скидка</th><th>Мин. сумма</th><th>Период</th><th>Использовано</th><th>Активен</th><th></th></tr></thead>
        <tbody>
          {list === null && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30 }}><Spinner dark /></td></tr>}
          {list?.length === 0 && <tr><td colSpan={7} style={{ color: '#6B6258' }}>Промокодов пока нет. Скидки применяются только по кодам, созданным здесь.</td></tr>}
          {list?.map((p) => (
            <tr key={p.id}>
              <td><b>{p.code}</b>{p.description && <div style={{ fontSize: 12, color: '#6B6258' }}>{p.description}</div>}</td>
              <td>{p.percent_off != null ? `−${p.percent_off}%` : `−${fmt(p.amount_off_kzt ?? 0)}`}</td>
              <td>{fmt(p.min_subtotal_kzt)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{p.starts_at ? dateShort(p.starts_at) : '…'} – {p.ends_at ? dateShort(p.ends_at) : '…'}</td>
              <td>{p.used_count}{p.max_uses != null ? ` / ${p.max_uses}` : ''}</td>
              <td><Toggle on={p.is_active} onChange={(v) => toggle(p, v)} label={`Активность ${p.code}`} /></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn" onClick={() => setEdit(p)} style={{ minHeight: 40, padding: '0 12px', borderRadius: 12, background: '#141210', color: '#fff', fontWeight: 800, fontSize: 13, marginRight: 6 }}>Изменить</button>
                <button className="btn" onClick={() => remove(p)} style={{ minHeight: 40, padding: '0 12px', borderRadius: 12, background: '#F3EADF', color: '#B3261E', fontWeight: 800, fontSize: 13 }}>Удалить</button>
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      {edit && <PromoEditor promo={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </>
  );
}

function PromoEditor({ promo, onClose, onSaved }: { promo: Promo | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Form>(promo ? {
    code: promo.code, description: promo.description ?? '', kind: promo.percent_off != null ? 'percent' : 'amount',
    value: String(promo.percent_off ?? promo.amount_off_kzt ?? ''), min_subtotal_kzt: String(promo.min_subtotal_kzt),
    starts: toDay(promo.starts_at), ends: toDay(promo.ends_at), max_uses: promo.max_uses == null ? '' : String(promo.max_uses),
  } : EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    const p = promoSchema.safeParse(f);
    if (!p.success) { setErr(p.error.issues[0].message); return; }
    const d = p.data;
    const row = {
      code: d.code, description: d.description || null,
      percent_off: d.kind === 'percent' ? Number(d.value) : null,
      amount_off_kzt: d.kind === 'amount' ? Number(d.value) : null,
      min_subtotal_kzt: Number(d.min_subtotal_kzt || 0),
      starts_at: d.starts ? almatyDayStart(d.starts) : null,
      ends_at: d.ends ? new Date(new Date(almatyDayStart(d.ends)).getTime() + 86_400_000).toISOString() : null,
      max_uses: d.max_uses ? Number(d.max_uses) : null,
    };
    setErr(''); setBusy(true);
    const { error } = promo ? await sb().from('promotions').update(row).eq('id', promo.id) : await sb().from('promotions').insert({ ...row, is_active: true });
    setBusy(false);
    if (error) return setErr(errText(error.message));
    toast('Промокод сохранён');
    onSaved();
  };
  const fld = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: k === 'code' ? e.target.value.toUpperCase() : e.target.value });

  return (
    <Drawer open onClose={onClose} title={promo ? `Промокод ${promo.code}` : 'Новый промокод'}>
      <Panel>
        <Label>КОД</Label><input className="field" value={f.code} onChange={fld('code')} placeholder="TOK10" style={{ textTransform: 'uppercase' }} />
        <Label>ОПИСАНИЕ</Label><input className="field" value={f.description} onChange={fld('description')} placeholder="Для чего этот код" />
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><Label>ТИП СКИДКИ</Label>
            <select className="field" value={f.kind} onChange={fld('kind')}><option value="percent">Процент</option><option value="amount">Сумма, ₸</option></select>
          </div>
          <div style={{ flex: 1 }}><Label>{f.kind === 'percent' ? 'ПРОЦЕНТ' : 'СУММА, ₸'}</Label><input className="field" value={f.value} onChange={fld('value')} inputMode="numeric" /></div>
        </div>
        <Label>МИНИМАЛЬНАЯ СУММА ЗАКАЗА, ₸</Label><input className="field" value={f.min_subtotal_kzt} onChange={fld('min_subtotal_kzt')} inputMode="numeric" />
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><Label>С</Label><input className="field" type="date" value={f.starts} onChange={fld('starts')} /></div>
          <div style={{ flex: 1 }}><Label>ПО (включительно)</Label><input className="field" type="date" value={f.ends} onChange={fld('ends')} /></div>
        </div>
        <Label>ЛИМИТ ИСПОЛЬЗОВАНИЙ (пусто = без лимита)</Label><input className="field" value={f.max_uses} onChange={fld('max_uses')} inputMode="numeric" />
        {err && <div role="alert" style={{ color: '#B3261E', fontWeight: 700, fontSize: 13, marginTop: 10 }}>{err}</div>}
        <button className="btn primary" disabled={busy} onClick={save} style={{ marginTop: 14, width: '100%', height: 48, borderRadius: 24 }}>{busy ? <Spinner /> : 'Сохранить'}</button>
      </Panel>
    </Drawer>
  );
}
