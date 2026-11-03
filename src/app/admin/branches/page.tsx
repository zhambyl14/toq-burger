'use client';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { Drawer, invalidateBranches, Label, PageHead, Panel, Toggle } from '@/components/admin/kit';
import { Spinner, toast } from '@/components/ui';
import { errText } from '@/features/admin/transitions';
import { fmt } from '@/lib/money';
import { sb } from '@/lib/supabase/client';
import type { Branch, Hours } from '@/types/catalog';

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
type HoursRow = Hours & { id: string };

const branchSchema = z.object({
  name: z.string().trim().min(2).max(80),
  short_name: z.string().trim().min(2).max(40),
  address: z.string().trim().min(5).max(200),
  map_url: z.union([z.literal(''), z.string().url('Ссылка должна начинаться с https://')]),
  lat: z.union([z.literal(''), z.coerce.number().min(42.9).max(43.6)]),
  lon: z.union([z.literal(''), z.coerce.number().min(76.5).max(77.4)]),
  delivery_radius_km: z.coerce.number().positive('Радиус > 0').max(50),
  delivery_fee_kzt: z.coerce.number().int('Тариф — целое число').min(0).max(100000),
  min_order_kzt: z.coerce.number().int().min(0).max(1000000),
}).refine((d) => (d.lat === '') === (d.lon === ''), { message: 'Укажите и широту, и долготу (Алматы)' });

export default function AdminBranches() {
  const [list, setList] = useState<Branch[] | null>(null);
  const [hours, setHours] = useState<HoursRow[]>([]);
  const [edit, setEdit] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [b, h] = await Promise.all([
      sb().from('branches').select('*').order('sort_order'),
      sb().from('branch_working_hours').select('id,branch_id,day_of_week,open_time,close_time').order('day_of_week').order('open_time'),
    ]);
    setList(((b.data as Branch[]) ?? []).map((x) => ({ ...x, delivery_radius_km: Number(x.delivery_radius_km) })));
    setHours((h.data as HoursRow[]) ?? []);
    invalidateBranches();
  }, []);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const flip = async (b: Branch, field: 'accepts_orders' | 'is_active', v: boolean) => {
    const { error } = await sb().from('branches').update({ [field]: v }).eq('id', b.id);
    if (error) return toast(errText(error.message));
    toast(field === 'accepts_orders' ? (v ? 'Филиал принимает заказы' : 'Приём заказов остановлен') : v ? 'Филиал включён' : 'Филиал скрыт');
    load();
  };

  if (!list) return <><PageHead title="Филиалы" /><div style={{ padding: 60, textAlign: 'center' }}><Spinner dark /></div></>;

  const summary = (id: string) => {
    const mon = hours.filter((h) => h.branch_id === id && h.day_of_week === 0).map((h) => `${h.open_time.slice(0, 5)}–${h.close_time.slice(0, 5) === '00:00' ? '24:00' : h.close_time.slice(0, 5)}`);
    return mon.length ? `Пн: ${mon.join(', ')}` : 'Часы не заданы';
  };

  return (
    <>
      <PageHead title="Филиалы" />
      <div className="admin-grid2" style={{ marginTop: 20 }}>
        {list.map((b) => (
          <Panel key={b.id}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div className="disp" style={{ fontSize: 16, fontWeight: 800, flex: 1 }}>{b.name}</div>
              {!b.is_active && <span style={{ fontSize: 11, fontWeight: 800, color: '#B3261E' }}>СКРЫТ</span>}
            </div>
            <div style={{ fontSize: 13, color: '#4A423A', fontWeight: 600, marginTop: 6, lineHeight: 1.4 }}>{b.address}</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 10 }}>{summary(b.id)}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#6B6258', marginTop: 4 }}>Радиус {b.delivery_radius_km} км · доставка {fmt(b.delivery_fee_kzt)} · мин. заказ {fmt(b.min_order_kzt)}</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, color: b.coords_verified ? '#2E8B3F' : '#B3261E' }}>
              Координаты: {b.lat != null ? `${b.lat.toFixed(5)}, ${b.lon!.toFixed(5)}` : 'не заданы'} · {b.coords_verified ? 'проверены' : 'НЕ проверены — авто-доставка отключена'}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => flip(b, 'accepts_orders', !b.accepts_orders)} style={{ minHeight: 44, padding: '0 18px', borderRadius: 22, background: b.accepts_orders ? '#2E8B3F' : '#B3261E', color: '#fff', fontWeight: 800, fontSize: 13 }}>
                {b.accepts_orders ? 'Принимает заказы' : 'Отключён'}
              </button>
              <button className="btn" onClick={() => setEdit(b.id)} style={{ minHeight: 44, padding: '0 18px', borderRadius: 22, background: '#141210', color: '#fff', fontWeight: 800, fontSize: 13 }}>Настроить</button>
              {b.map_url && <a href={b.map_url} target="_blank" rel="noopener noreferrer" style={{ minHeight: 44, padding: '0 18px', borderRadius: 22, background: '#F3EADF', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', textDecoration: 'none' }}>2GIS ↗</a>}
            </div>
          </Panel>
        ))}
      </div>
      {edit && <BranchEditor b={list.find((x) => x.id === edit)!} hours={hours.filter((h) => h.branch_id === edit)} onClose={() => setEdit(null)} onSaved={load} onFlip={flip} />}
    </>
  );
}

function BranchEditor({ b, hours, onClose, onSaved, onFlip }: { b: Branch; hours: HoursRow[]; onClose: () => void; onSaved: () => void; onFlip: (b: Branch, f: 'accepts_orders' | 'is_active', v: boolean) => void }) {
  const [f, setF] = useState({
    name: b.name, short_name: b.short_name, address: b.address, map_url: b.map_url ?? '',
    lat: b.lat == null ? '' : String(b.lat), lon: b.lon == null ? '' : String(b.lon),
    delivery_radius_km: String(b.delivery_radius_km), delivery_fee_kzt: String(b.delivery_fee_kzt), min_order_kzt: String(b.min_order_kzt),
  });
  const [verified, setVerified] = useState(b.coords_verified);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const coordsChanged = f.lat !== (b.lat == null ? '' : String(b.lat)) || f.lon !== (b.lon == null ? '' : String(b.lon));

  const save = async () => {
    const p = branchSchema.safeParse(f);
    if (!p.success) { setErr(p.error.issues[0].message); return; }
    const d = p.data;
    const hasCoords = d.lat !== '';
    if (verified && !hasCoords) { setErr('Нельзя подтвердить пустые координаты'); return; }
    setErr(''); setBusy(true);
    const { error } = await sb().from('branches').update({
      name: d.name, short_name: d.short_name, address: d.address, map_url: d.map_url || null,
      lat: hasCoords ? d.lat : null, lon: hasCoords ? d.lon : null, coords_verified: hasCoords && verified,
      delivery_radius_km: d.delivery_radius_km, delivery_fee_kzt: d.delivery_fee_kzt, min_order_kzt: d.min_order_kzt,
    }).eq('id', b.id);
    setBusy(false);
    if (error) return setErr(errText(error.message));
    toast('Филиал сохранён');
    onSaved();
  };

  const fld = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF({ ...f, [k]: e.target.value });
    if (k === 'lat' || k === 'lon') setVerified(false); // new coordinates must be re-verified
  };

  return (
    <Drawer open onClose={onClose} title={b.name}>
      <Panel>
        <Label>НАЗВАНИЕ</Label><input className="field" value={f.name} onChange={fld('name')} />
        <Label>КОРОТКОЕ НАЗВАНИЕ</Label><input className="field" value={f.short_name} onChange={fld('short_name')} />
        <Label>АДРЕС</Label><input className="field" value={f.address} onChange={fld('address')} />
        <Label>ССЫЛКА 2GIS</Label><input className="field" value={f.map_url} onChange={fld('map_url')} placeholder="https://go.2gis.com/…" />
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><Label>ШИРОТА</Label><input className="field" value={f.lat} onChange={fld('lat')} inputMode="decimal" placeholder="43.2…" /></div>
          <div style={{ flex: 1 }}><Label>ДОЛГОТА</Label><input className="field" value={f.lon} onChange={fld('lon')} inputMode="decimal" placeholder="76.9…" /></div>
        </div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, fontSize: 13, fontWeight: 700, lineHeight: 1.4, cursor: 'pointer' }}>
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, accentColor: '#FF6A0A' }} />
          <span>Координаты проверены по 2GIS. <span style={{ color: '#6B6258', fontWeight: 600 }}>Автоматическое назначение филиала для доставки использует только проверенные координаты. {coordsChanged ? 'Координаты изменены — подтвердите заново.' : ''}</span></span>
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 120 }}><Label>РАДИУС ДОСТАВКИ, КМ</Label><input className="field" value={f.delivery_radius_km} onChange={fld('delivery_radius_km')} inputMode="decimal" /></div>
          <div style={{ flex: 1, minWidth: 120 }}><Label>ДОСТАВКА, ₸</Label><input className="field" value={f.delivery_fee_kzt} onChange={fld('delivery_fee_kzt')} inputMode="numeric" /></div>
          <div style={{ flex: 1, minWidth: 120 }}><Label>МИН. ЗАКАЗ, ₸</Label><input className="field" value={f.min_order_kzt} onChange={fld('min_order_kzt')} inputMode="numeric" /></div>
        </div>
        {err && <div role="alert" style={{ color: '#B3261E', fontWeight: 700, fontSize: 13, marginTop: 10 }}>{err}</div>}
        <button className="btn primary" disabled={busy} onClick={save} style={{ marginTop: 14, width: '100%', height: 48, borderRadius: 24 }}>{busy ? <Spinner /> : 'Сохранить'}</button>
        <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Toggle on={b.accepts_orders} onChange={(v) => onFlip(b, 'accepts_orders', v)} label="Принимает заказы" /><span style={{ fontWeight: 700, fontSize: 13 }}>Принимает заказы</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Toggle on={b.is_active} onChange={(v) => onFlip(b, 'is_active', v)} label="Показывать на сайте" /><span style={{ fontWeight: 700, fontSize: 13 }}>Показывать на сайте</span></div>
        </div>
      </Panel>
      <HoursEditor branchId={b.id} hours={hours} onSaved={onSaved} />
    </Drawer>
  );
}

function HoursEditor({ branchId, hours, onSaved }: { branchId: string; hours: HoursRow[]; onSaved: () => void }) {
  const [rows, setRows] = useState<{ day: number; open: string; close: string }[]>(() =>
    hours.map((h) => ({ day: h.day_of_week, open: h.open_time.slice(0, 5), close: h.close_time.slice(0, 5) })));
  const [busy, setBusy] = useState(false);

  const setDefault = () => setRows(Array.from({ length: 7 }, (_, d) => [{ day: d, open: '00:00', close: '06:00' }, { day: d, open: '08:00', close: '00:00' }]).flat());
  const upd = (i: number, k: 'open' | 'close', v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const save = async () => {
    for (const r of rows) {
      if (!/^\d{2}:\d{2}$/.test(r.open) || !/^\d{2}:\d{2}$/.test(r.close)) return toast('Неверный формат времени');
      if (r.close !== '00:00' && r.close <= r.open) return toast(`${DAYS[r.day]}: время закрытия должно быть позже открытия (00:00 = полночь)`);
    }
    const keys = rows.map((r) => `${r.day}-${r.open}`);
    if (new Set(keys).size !== keys.length) return toast('Есть повторяющиеся окна');
    setBusy(true);
    const { error } = await sb().rpc('admin_set_branch_hours', {
      p_branch: branchId,
      p_rows: rows.map((r) => ({ day_of_week: r.day, open_time: r.open, close_time: r.close })),
    });
    setBusy(false);
    if (error) return toast(errText(error.message));
    toast('Часы работы сохранены');
    onSaved();
  };

  return (
    <Panel style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>Часы работы</div>
        <button className="btn" onClick={setDefault} style={{ minHeight: 36, padding: '0 12px', borderRadius: 12, background: '#FFF1E0', color: '#C24D00', fontWeight: 800, fontSize: 12 }}>00–06 и 08–24 ежедневно</button>
      </div>
      <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 4 }}>Каждая строка — окно работы. Закрытие 00:00 означает полночь. Перерыв = промежуток между окнами.</div>
      {DAYS.map((d, day) => (
        <div key={day} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ width: 28, fontWeight: 800, fontSize: 13 }}>{d}</span>
          {rows.map((r, i) => r.day !== day ? null : (
            <span key={i} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', background: '#F3EADF', borderRadius: 12, padding: 4 }}>
              <input type="time" value={r.open} onChange={(e) => upd(i, 'open', e.target.value)} aria-label={`${d} открытие`} style={{ border: 0, background: '#fff', borderRadius: 8, padding: '4px 6px', fontWeight: 700 }} />–
              <input type="time" value={r.close} onChange={(e) => upd(i, 'close', e.target.value)} aria-label={`${d} закрытие`} style={{ border: 0, background: '#fff', borderRadius: 8, padding: '4px 6px', fontWeight: 700 }} />
              <button className="btn" aria-label="Удалить окно" onClick={() => setRows(rows.filter((_, j) => j !== i))} style={{ width: 28, height: 28, color: '#B3261E', fontWeight: 800 }}>✕</button>
            </span>
          ))}
          <button className="btn" onClick={() => setRows([...rows, { day, open: '08:00', close: '00:00' }])} style={{ minHeight: 32, padding: '0 10px', borderRadius: 10, background: '#fff', border: '2px solid #F3EADF', fontWeight: 800, fontSize: 12 }}>+ окно</button>
          {!rows.some((r) => r.day === day) && <span style={{ fontSize: 12, color: '#B3261E', fontWeight: 700 }}>выходной</span>}
        </div>
      ))}
      <button className="btn dark" disabled={busy} onClick={save} style={{ marginTop: 14, width: '100%', height: 48, borderRadius: 24 }}>{busy ? <Spinner /> : 'Сохранить часы'}</button>
    </Panel>
  );
}
