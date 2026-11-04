'use client';
import { useCallback, useEffect, useState } from 'react';
import { ImageEditor } from '@/components/admin/ImageEditor';
import { Drawer, Label, Panel, Toggle, useAdminBranches } from '@/components/admin/kit';
import { Spinner, toast } from '@/components/ui';
import {
  PHOTO_UPDATED_TOAST, buildNutrition, nutritionToForm, productSchema, removeProductImage, splitList, uploadProductImage, validateImageFile, validateNutritionForm,
  type AdminCategory, type AdminProduct, type AdminVariant, type NutritionForm,
} from '@/features/admin/catalog';
import { errText } from '@/features/admin/transitions';
import { meatName } from '@/features/catalog/hooks';
import { sb } from '@/lib/supabase/client';
import type { Meat } from '@/types/catalog';
import { KkWrap, PhotoRow } from './parts';

const NUTRI_FIELDS: { k: keyof NutritionForm; label: string }[] = [
  { k: 'kcal', label: 'ккал' },
  { k: 'protein', label: 'ақуыз / белок' },
  { k: 'fat', label: 'май / жиры' },
  { k: 'carbs', label: 'көмірсу / углевод' },
];

function VariantRow({ v, onSaved }: { v: AdminVariant; onSaved: () => void }) {
  const initial = nutritionToForm(v.nutrition);
  const [nf, setNf] = useState<NutritionForm>(initial);
  const [labelKk, setLabelKk] = useState(v.label_kk ?? '');
  const [busy, setBusy] = useState(false);

  const built = buildNutrition(nf);
  const dirty = labelKk.trim() !== (v.label_kk ?? '') || (['kcal', 'protein', 'fat', 'carbs'] as const).some((k) => nf[k].trim() !== initial[k]);
  const unparsed = !!v.nutrition && !initial.kcal && !initial.protein && !initial.fat && !initial.carbs;

  const save = async () => {
    const bad = validateNutritionForm(nf);
    if (bad) return toast(bad);
    if (labelKk.trim().length > 40) return toast('Название варианта (ҚАЗ) — до 40 символов');
    setBusy(true);
    const { error } = await sb().from('product_variants').update({
      label_kk: labelKk.trim() || null, nutrition: built.ru, nutrition_kk: built.kk,
    }).eq('id', v.id);
    setBusy(false);
    if (error) return toast(errText(error.message));
    toast('Вариант сохранён');
    onSaved();
  };

  const name = v.meat === 'one' ? v.label : meatName(v.meat);
  return (
    <div className="apr-variant">
      <div style={{ fontWeight: 800, fontSize: 13 }}>{name} — цена меняется в таблице</div>
      <Label>НАЗВАНИЕ ВАРИАНТА</Label>
      <div className="apr-pair">
        <input className="field" value={v.label} readOnly aria-label={`Название варианта ${name}`} />
        <KkWrap><input className="field" value={labelKk} maxLength={40} placeholder={v.label} aria-label={`Название варианта ${name} (казахский)`} onChange={(e) => setLabelKk(e.target.value)} /></KkWrap>
      </div>
      <Label>КБЖУ (на одну порцию)</Label>
      <div className="apr-nutri">
        {NUTRI_FIELDS.map((n) => (
          <label key={n.k}>{n.label}
            <input className="field" inputMode="decimal" value={nf[n.k]} placeholder="—" aria-label={`${n.label}, ${name}`}
              onChange={(e) => setNf({ ...nf, [n.k]: e.target.value.replace(/[^\d.,]/g, '').slice(0, 7) })} />
          </label>
        ))}
      </div>
      <div className="apr-preview">
        {built.ru ? <>RU: {built.ru}<br />ҚАЗ: {built.kk}</> : 'КБЖУ не указано — карточка на сайте не показывается'}
      </div>
      {unparsed && <div style={{ fontSize: 12, color: '#B3261E', fontWeight: 700, marginTop: 6 }}>Прежнее значение «{v.nutrition}» не распознано. После сохранения оно будет заменено.</div>}
      <button type="button" className="btn primary" disabled={busy || !dirty} onClick={save} style={{ marginTop: 10, width: '100%', height: 44, borderRadius: 22 }}>{busy ? <Spinner /> : 'Сохранить вариант'}</button>
    </div>
  );
}

export function ProductEditor({ id, products, cats, onClose, onSaved }: { id: string; products: AdminProduct[]; cats: AdminCategory[]; onClose: () => void; onSaved: () => void }) {
  const p = products.find((x) => x.id === id);
  const branches = useAdminBranches();
  // the editor is keyed by product id, so initial state is taken once per product
  const [f, setF] = useState(() => ({
    name: p?.name ?? '', tagline: p?.tagline ?? '', description: p?.description ?? '', ingredients: p?.ingredients.join(', ') ?? '',
    name_kk: p?.name_kk ?? '', tagline_kk: p?.tagline_kk ?? '', description_kk: p?.description_kk ?? '', ingredients_kk: p?.ingredients_kk?.join(', ') ?? '',
    sort_order: String(p?.sort_order ?? 0), category_id: p?.category_id ?? '',
  }));
  const [active, setActiveP] = useState(p?.is_active ?? true);
  const [avail, setAvail] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pending, setPending] = useState<{ file: File; target: { variant?: AdminVariant } } | null>(null);

  useEffect(() => {
    sb().from('product_availability').select('branch_id,is_available').eq('product_id', id).then(({ data, error }) => {
      if (error) { toast(errText(error.message)); return; }
      const m: Record<string, boolean> = {};
      (data as { branch_id: string; is_available: boolean }[] | null)?.forEach((r) => { m[r.branch_id] = r.is_available; });
      setAvail(m);
    });
  }, [id]);

  const cancelPending = useCallback(() => setPending(null), []);

  if (!p) return null;

  const save = async () => {
    const parsed = productSchema.safeParse(f);
    if (!parsed.success) { setErr(parsed.error.issues[0].message); return; }
    setErr(''); setBusy(true);
    const d = parsed.data;
    const { error } = await sb().from('products').update({
      name: d.name, tagline: d.tagline || null, description: d.description || null, ingredients: splitList(d.ingredients),
      name_kk: d.name_kk || null, tagline_kk: d.tagline_kk || null, description_kk: d.description_kk || null, ingredients_kk: splitList(d.ingredients_kk),
      sort_order: Number(d.sort_order), category_id: d.category_id, is_active: active,
    }).eq('id', p.id);
    setBusy(false);
    if (error) return setErr(errText(error.message));
    toast('Продукт сохранён');
    onSaved();
  };

  const setAvailability = async (branchId: string, v: boolean) => {
    setAvail((a) => ({ ...a, [branchId]: v }));
    const { error } = await sb().from('product_availability').upsert({ branch_id: branchId, product_id: p.id, is_available: v });
    if (error) { toast(errText(error.message)); setAvail((a) => ({ ...a, [branchId]: !v })); return; }
    toast(v ? 'Доступен в филиале' : 'Стоп-лист: недоступен в филиале');
  };

  const upload = async (blob: Blob, target: { variant?: AdminVariant }) => {
    setBusy(true);
    let newPath: string | null = null;
    try {
      newPath = await uploadProductImage(blob, p.id);
      const { error } = target.variant
        ? await sb().from('product_variants').update({ image_path: newPath }).eq('id', target.variant.id)
        : await sb().from('products').update({ image_path: newPath }).eq('id', p.id);
      if (error) throw new Error(errText(error.message));
      const old = target.variant ? target.variant.image_path : p.image_path;
      if (old && old !== newPath) {
        const rm = await removeProductImage(old);
        if (rm) toast('Старый файл не удалён из хранилища: ' + rm);
      }
      toast(PHOTO_UPDATED_TOAST);
      onSaved();
    } catch (e) {
      if (newPath) await removeProductImage(newPath);
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const deletePhoto = async (target: { variant?: AdminVariant }) => {
    const old = target.variant ? target.variant.image_path : p.image_path;
    if (!old || !confirm('Удалить фото?')) return;
    setBusy(true);
    const { error } = target.variant
      ? await sb().from('product_variants').update({ image_path: null }).eq('id', target.variant.id)
      : await sb().from('products').update({ image_path: null }).eq('id', p.id);
    if (error) { setBusy(false); return toast(errText(error.message)); }
    const rm = await removeProductImage(old);
    setBusy(false);
    if (rm) toast('Фото снято, но файл не удалён из хранилища: ' + rm);
    else toast('Фото удалено. На сайте обновится в течение минуты');
    onSaved();
  };

  const pick = (file: File | undefined, target: { variant?: AdminVariant }) => {
    if (!file) return;
    const m = validateImageFile(file);
    if (m) return toast(m);
    setPending({ file, target });
  };

  const addVariant = async (meat: Meat) => {
    const { error } = await sb().from('product_variants').insert({ product_id: p.id, meat, label: meatName(meat), price_kzt: null });
    if (error) return toast(errText(error.message));
    toast('Вариант добавлен — укажите цену в таблице');
    onSaved();
  };

  const fld = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const isBurger = cats.find((c) => c.id === p.category_id)?.slug === 'burgers';

  return (
    <Drawer open onClose={onClose} title={p.name}>
      <Panel>
        <Label>НАЗВАНИЕ</Label>
        <div className="apr-pair">
          <input className="field" value={f.name} onChange={fld('name')} aria-label="Название" />
          <KkWrap><input className="field" value={f.name_kk} onChange={fld('name_kk')} maxLength={80} placeholder={f.name} aria-label="Название (казахский)" /></KkWrap>
        </div>
        <Label>ПОДЗАГОЛОВОК</Label>
        <div className="apr-pair">
          <input className="field" value={f.tagline} onChange={fld('tagline')} aria-label="Подзаголовок" />
          <KkWrap><input className="field" value={f.tagline_kk} onChange={fld('tagline_kk')} maxLength={120} placeholder={f.tagline} aria-label="Подзаголовок (казахский)" /></KkWrap>
        </div>
        <Label>ОПИСАНИЕ</Label>
        <div className="apr-pair">
          <textarea className="field apr-ta" value={f.description} onChange={fld('description')} rows={4} aria-label="Описание" />
          <KkWrap area><textarea className="field apr-ta" value={f.description_kk} onChange={fld('description_kk')} rows={4} maxLength={1000} aria-label="Описание (казахский)" /></KkWrap>
        </div>
        <Label>СОСТАВ (через запятую или с новой строки)</Label>
        <div className="apr-pair">
          <textarea className="field apr-ta" value={f.ingredients} onChange={fld('ingredients')} rows={3} aria-label="Состав" />
          <KkWrap area><textarea className="field apr-ta" value={f.ingredients_kk} onChange={fld('ingredients_kk')} rows={3} maxLength={500} aria-label="Состав (казахский)" /></KkWrap>
        </div>
        <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 6 }}>Пустое казахское поле — на сайте покажется русский текст.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><Label>КАТЕГОРИЯ</Label><select className="field" value={f.category_id} onChange={fld('category_id')} aria-label="Категория">{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div style={{ width: 120 }}><Label>ПОРЯДОК</Label><input className="field" value={f.sort_order} onChange={fld('sort_order')} inputMode="numeric" aria-label="Порядок" /></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}><Toggle on={active} onChange={setActiveP} label="Показывать в меню" /><span style={{ fontWeight: 800, fontSize: 14 }}>Показывать в меню</span></div>
        {err && <div role="alert" style={{ color: '#B3261E', fontWeight: 700, fontSize: 13, marginTop: 10 }}>{err}</div>}
        <button className="btn primary" disabled={busy} onClick={save} style={{ marginTop: 14, width: '100%', height: 48, borderRadius: 24 }}>{busy ? <Spinner /> : 'Сохранить'}</button>
      </Panel>

      <Panel style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Фото</div>
        <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 4 }}>PNG/JPEG/WEBP до 8 МБ. Перед загрузкой фото можно обрезать и поправить. Хранится в Supabase Storage.</div>
        <PhotoRow label="Основное фото" path={p.image_path} disabled={busy} onFile={(file) => pick(file, {})} onDelete={() => deletePhoto({})} />
        {p.product_variants.filter((v) => v.meat !== 'one').map((v) => (
          <PhotoRow key={v.id} label={`Фото: ${meatName(v.meat)}`} path={v.image_path} disabled={busy} onFile={(file) => pick(file, { variant: v })} onDelete={() => deletePhoto({ variant: v })} />
        ))}
      </Panel>

      <Panel style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Варианты и КБЖУ</div>
        <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 4 }}>Заполните числа — строки «Б · Ж · У · ккал» (рус.) и «А · М · Ұ · ккал» (қаз.) соберутся автоматически.</div>
        {p.product_variants.map((v) => (
          <VariantRow key={`${v.id}:${v.nutrition ?? ''}:${v.label_kk ?? ''}`} v={v} onSaved={onSaved} />
        ))}
        {isBurger && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {(['chicken', 'beef'] as Meat[]).filter((m) => !p.product_variants.some((v) => v.meat === m)).map((m) => (
              <button key={m} className="btn" onClick={() => addVariant(m)} style={{ minHeight: 40, padding: '0 14px', borderRadius: 12, background: '#FFF1E0', color: '#C24D00', fontWeight: 800, fontSize: 13 }}>+ Вариант «{meatName(m)}»</button>
            ))}
          </div>
        )}
      </Panel>

      <Panel style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Наличие по филиалам</div>
        <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, marginTop: 4 }}>Выключите, если позиция закончилась в конкретном филиале (стоп-лист).</div>
        {branches.map((b) => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <Toggle on={avail[b.id] ?? true} onChange={(v) => setAvailability(b.id, v)} label={`Наличие в ${b.short_name}`} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>{b.short_name}</span>
          </div>
        ))}
      </Panel>
      {pending && <ImageEditor file={pending.file} onCancel={cancelPending} onDone={(blob) => { const t = pending.target; setPending(null); upload(blob, t); }} />}
    </Drawer>
  );
}
