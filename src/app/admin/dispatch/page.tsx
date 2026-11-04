'use client';
import { useEffect, useState } from 'react';
import { CourierLivePanel } from '@/components/admin/CourierPanels';
import { PageHead, Panel, Toggle } from '@/components/admin/kit';
import { Spinner, toast } from '@/components/ui';
import {
  type DispatchSettings, SETTINGS_COLUMNS, dispatchErr, dispatchSettingsSchema, dispatchSummary, parseNum, useLiveCouriers,
} from '@/features/admin/couriers';
import { dateShort, timeHM } from '@/features/orders/status';
import { sb } from '@/lib/supabase/client';

type NumKey = 'max_batch_size' | 'ready_window_min' | 'max_drop_distance_km' | 'max_bearing_diff_deg' | 'location_max_age_min';
interface Form {
  enabled: boolean; batch_enabled: boolean;
  max_batch_size: string; ready_window_min: string; max_drop_distance_km: string; max_bearing_diff_deg: string; location_max_age_min: string;
}

const FIELDS: { key: NumKey; label: string; unit: string; step: number; hint: string }[] = [
  { key: 'max_batch_size', label: 'Максимум заказов у курьера', unit: 'шт.', step: 1, hint: 'Сколько заказов курьер может везти за один рейс (от 1 до 10). 1 — пачки не нужны.' },
  { key: 'ready_window_min', label: 'Разница во времени готовности заказов, минут', unit: 'мин.', step: 1, hint: 'Заказы можно отдать одному курьеру, если они будут готовы с разницей не больше этого времени (от 0 до 60).' },
  { key: 'max_drop_distance_km', label: 'Макс. расстояние между адресами, км', unit: 'км', step: 0.1, hint: 'Если адреса доставки ближе друг к другу, чем это расстояние, заказы едут вместе.' },
  { key: 'max_bearing_diff_deg', label: 'Макс. разница направления, °', unit: '°', step: 1, hint: 'Если адреса далеко, но лежат в одной стороне от филиала (угол между направлениями не больше этого значения, от 0 до 180), заказы тоже едут вместе.' },
  { key: 'location_max_age_min', label: 'Свежесть GPS курьера, минут', unit: 'мин.', step: 1, hint: 'Положение курьера считается актуальным, если обновлялось не раньше этого времени (от 1 до 240). Иначе курьер выбирается по тому, кто дольше свободен.' },
];

const toForm = (s: DispatchSettings): Form => ({
  enabled: s.enabled, batch_enabled: s.batch_enabled,
  max_batch_size: String(s.max_batch_size), ready_window_min: String(s.ready_window_min),
  max_drop_distance_km: String(s.max_drop_distance_km), max_bearing_diff_deg: String(s.max_bearing_diff_deg), location_max_age_min: String(s.location_max_age_min),
});

function parseForm(f: Form) {
  return dispatchSettingsSchema.safeParse({
    enabled: f.enabled, batch_enabled: f.batch_enabled,
    max_batch_size: parseNum(f.max_batch_size), ready_window_min: parseNum(f.ready_window_min),
    max_drop_distance_km: parseNum(f.max_drop_distance_km), max_bearing_diff_deg: parseNum(f.max_bearing_diff_deg),
    location_max_age_min: parseNum(f.location_max_age_min),
  });
}

function stamp(iso: string): string {
  return `${dateShort(iso)} ${timeHM(iso)}`;
}

export default function AdminDispatch() {
  const [saved, setSaved] = useState<DispatchSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const live = useLiveCouriers(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await sb().from('dispatch_settings').select(SETTINGS_COLUMNS).eq('id', 1).maybeSingle();
      if (!alive) return;
      if (error) { toast(dispatchErr(error.message)); return; }
      if (!data) { toast('Настройки диспетчеризации не найдены'); return; }
      const s = data as DispatchSettings;
      setSaved(s);
      setForm(toForm(s));
    })();
    return () => { alive = false; };
  }, [reloadKey]);

  if (!form || !saved) {
    return (
      <>
        <PageHead title="Диспетчеризация" />
        <div style={{ textAlign: 'center', padding: 40 }}><Spinner dark /></div>
        <CourierLivePanel couriers={live.couriers} ready={live.ready} />
      </>
    );
  }

  const parsed = parseForm(form);
  const errors: Partial<Record<keyof Form, string>> = {};
  if (!parsed.success) {
    for (const i of parsed.error.issues) {
      const k = i.path[0] as keyof Form;
      if (!errors[k]) errors[k] = i.message;
    }
  }
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(saved));
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });

  const save = async () => {
    const p = parseForm(form);
    if (!p.success) { toast(p.error.issues[0].message); return; }
    setBusy(true);
    const values = { ...p.data, max_drop_distance_km: Math.round(p.data.max_drop_distance_km * 100) / 100 };
    const { data, error } = await sb().from('dispatch_settings').update({ ...values, updated_at: new Date().toISOString() }).eq('id', 1).select(SETTINGS_COLUMNS).maybeSingle();
    setBusy(false);
    if (error) { toast(dispatchErr(error.message)); return; }
    if (!data) { toast('Не удалось сохранить: нет доступа'); return; }
    const s = data as DispatchSettings;
    setSaved(s);
    setForm(toForm(s));
    toast('Настройки сохранены');
  };

  return (
    <>
      <PageHead title="Диспетчеризация" />
      <div style={{ fontSize: 13, color: '#6B6258', fontWeight: 600, marginTop: 6, maxWidth: 720 }}>
        Курьеры не выбирают заказы сами: когда доставка начинает готовиться, система назначает курьера автоматически, и он едет в филиал, пока кухня заканчивает заказ.
      </div>

      <Panel style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Toggle on={form.enabled} onChange={(v) => set({ enabled: v })} label="Автоназначение курьеров" disabled={busy} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Автоназначение курьеров</div>
            <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 2 }}>Если выключить, заказы не назначаются сами — курьера выбирает администратор или модератор в карточке заказа.</div>
          </div>
        </div>
        <div style={{ borderTop: '2px dashed #F3EADF', margin: '16px 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Toggle on={form.batch_enabled} onChange={(v) => set({ batch_enabled: v })} label="Несколько заказов одному курьеру" disabled={busy} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Несколько заказов одному курьеру</div>
            <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 2 }}>Курьер, который едет в филиал или ждёт там, получает ещё заказы из того же филиала, если они подходят по условиям ниже.</div>
          </div>
        </div>

        <div className="admin-grid2" style={{ marginTop: 20 }}>
          {FIELDS.map((fl) => {
            const err = errors[fl.key];
            const id = `dispatch-${fl.key}`;
            return (
              <div key={fl.key}>
                <label htmlFor={id} style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#6B6258', marginBottom: 6 }}>{fl.label}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input id={id} className="field" type="number" inputMode="decimal" step={fl.step} value={form[fl.key]} disabled={busy}
                    aria-invalid={err ? true : undefined} aria-describedby={`${id}-hint`}
                    onChange={(e) => set({ [fl.key]: e.target.value } as Partial<Form>)} style={{ maxWidth: 160 }} />
                  <span style={{ fontWeight: 800, color: '#6B6258' }}>{fl.unit}</span>
                </div>
                <div id={`${id}-hint`} style={{ fontSize: 12, fontWeight: 600, marginTop: 6, color: err ? '#B3261E' : '#6B6258' }} role={err ? 'alert' : undefined}>{err ?? fl.hint}</div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 20, background: '#FFF1E0', borderRadius: 16, padding: '14px 16px' }} aria-live="polite">
          <div style={{ fontSize: 12, fontWeight: 800, color: '#C24D00' }}>КАК ЭТО РАБОТАЕТ СЕЙЧАС</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6, lineHeight: 1.5 }}>
            {parsed.success ? dispatchSummary(parsed.data) : 'Исправьте значения в полях выше — после этого здесь появится описание правил.'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
          <button className="btn primary" disabled={busy || !dirty || !parsed.success} onClick={save} style={{ height: 48, padding: '0 28px', borderRadius: 24 }}>{busy ? <Spinner /> : 'Сохранить'}</button>
          {dirty && <button className="btn" disabled={busy} onClick={() => setForm(toForm(saved))} style={{ height: 48, padding: '0 20px', borderRadius: 24, background: '#F3EADF', fontWeight: 800 }}>Сбросить изменения</button>}
          <span style={{ fontSize: 12, color: '#6B6258', fontWeight: 700 }}>Обновлено: {stamp(saved.updated_at)}</span>
          <button className="btn" onClick={() => setReloadKey((k) => k + 1)} style={{ minHeight: 40, padding: '0 12px', borderRadius: 12, fontSize: 12, fontWeight: 800, color: '#6B6258' }}>Обновить из базы</button>
        </div>
      </Panel>

      <CourierLivePanel couriers={live.couriers} ready={live.ready} />
    </>
  );
}
