'use client';
import { useCallback, useEffect, useState } from 'react';
import { ImageEditor } from '@/components/admin/ImageEditor';
import { Panel, Toggle } from '@/components/admin/kit';
import { ProductImg, Spinner, toast } from '@/components/ui';
import { PHOTO_UPDATED_TOAST, extraSchema, removeProductImage, slugify, uploadExtraImage, validateImageFile, type AdminExtra } from '@/features/admin/catalog';
import { errText } from '@/features/admin/transitions';
import { sb } from '@/lib/supabase/client';
import { KkWrap } from './parts';

const darkBtn = { background: '#141210', color: '#fff', cursor: 'pointer' } as const;
const sandBtn = { background: '#F3EADF', color: '#B3261E' } as const;

function ExtraRow({ e, busy, onSaved, onActive, onFile, onDeletePhoto }: {
  e: AdminExtra; busy: boolean; onSaved: () => void; onActive: (v: boolean) => void; onFile: (f: File | undefined) => void; onDeletePhoto: () => void;
}) {
  const [name, setName] = useState(e.name);
  const [nameKk, setNameKk] = useState(e.name_kk ?? '');
  const [price, setPrice] = useState(String(e.price_kzt));
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== e.name || nameKk.trim() !== (e.name_kk ?? '') || price !== String(e.price_kzt);

  const save = async () => {
    const parsed = extraSchema.safeParse({ name, name_kk: nameKk, price });
    if (!parsed.success) return toast(parsed.error.issues[0].message);
    setSaving(true);
    const { error } = await sb().from('product_extras').update({ name: parsed.data.name, name_kk: parsed.data.name_kk || null, price_kzt: Number(parsed.data.price) }).eq('id', e.id);
    setSaving(false);
    if (error) return toast(errText(error.message));
    toast('Добавка сохранена');
    onSaved();
  };

  return (
    <div className="apr-extra" style={{ opacity: e.is_active ? 1 : 0.6 }}>
      <div className="apr-extra-img"><ProductImg path={e.image_path} /></div>
      <div className="apr-extra-fields">
        <input className="field" value={name} maxLength={80} aria-label={`Название добавки ${e.name}`} onChange={(x) => setName(x.target.value)} />
        <KkWrap><input className="field" value={nameKk} maxLength={80} placeholder={name} aria-label={`Название добавки ${e.name} (казахский)`} onChange={(x) => setNameKk(x.target.value)} /></KkWrap>
        <input className="field" value={price} inputMode="numeric" placeholder="₸" aria-label={`Цена добавки ${e.name}, ₸`} onChange={(x) => setPrice(x.target.value.replace(/\D/g, '').slice(0, 7))} />
      </div>
      <div className="apr-extra-actions">
        <Toggle on={e.is_active} label={`Активность ${e.name}`} onChange={onActive} />
        <span style={{ fontWeight: 700, fontSize: 13 }}>{e.is_active ? 'Активна' : 'Скрыта'}</span>
        <div style={{ flex: 1 }} />
        <label className="btn apr-small-btn" style={{ ...darkBtn, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}>
          {e.image_path ? 'Заменить фото' : 'Загрузить фото'}
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} aria-label={`Фото добавки ${e.name}`} style={{ display: 'none' }} onChange={(x) => { onFile(x.target.files?.[0]); x.target.value = ''; }} />
        </label>
        {e.image_path && <button type="button" className="btn apr-small-btn" disabled={busy} onClick={onDeletePhoto} aria-label={`Удалить фото: ${e.name}`} style={sandBtn}>Удалить фото</button>}
        <button type="button" className="btn primary apr-small-btn" disabled={!dirty || saving || busy} onClick={save} style={{ borderRadius: 12 }}>{saving ? <Spinner /> : 'Сохранить'}</button>
      </div>
    </div>
  );
}

export function ExtrasSection({ extras, onChanged }: { extras: AdminExtra[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ file: File; extra: AdminExtra } | null>(null);
  const [newName, setNewName] = useState('');
  const [newNameKk, setNewNameKk] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newPhoto, setNewPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);
  const photoUrl = newPhoto?.url;
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);
  const cancelPending = useCallback(() => setPending(null), []);
  const cancelNewFile = useCallback(() => setNewFile(null), []);

  // the extras of the burgers share one group: take the group of the first extra
  const groupId = extras[0]?.group_id ?? null;

  const setActive = async (e: AdminExtra, v: boolean) => {
    const { error } = await sb().from('product_extras').update({ is_active: v }).eq('id', e.id);
    if (error) return toast(errText(error.message));
    toast(v ? 'Включено' : 'Скрыто из меню');
    onChanged();
  };

  const pick = (e: AdminExtra, file: File | undefined) => {
    if (!file) return;
    const m = validateImageFile(file);
    if (m) return toast(m);
    setPending({ file, extra: e });
  };

  const upload = async (blob: Blob, e: AdminExtra) => {
    setBusy(true);
    let newPath: string | null = null;
    try {
      newPath = await uploadExtraImage(blob, e.id);
      const { error } = await sb().from('product_extras').update({ image_path: newPath }).eq('id', e.id);
      if (error) throw new Error(errText(error.message));
      if (e.image_path && e.image_path !== newPath) {
        const rm = await removeProductImage(e.image_path);
        if (rm) toast('Старый файл не удалён из хранилища: ' + rm);
      }
      toast(PHOTO_UPDATED_TOAST);
      onChanged();
    } catch (x) {
      if (newPath) await removeProductImage(newPath);
      toast((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const deletePhoto = async (e: AdminExtra) => {
    if (!e.image_path || !confirm('Удалить фото?')) return;
    setBusy(true);
    const { error } = await sb().from('product_extras').update({ image_path: null }).eq('id', e.id);
    if (error) { setBusy(false); return toast(errText(error.message)); }
    const rm = await removeProductImage(e.image_path);
    setBusy(false);
    if (rm) toast('Фото снято, но файл не удалён из хранилища: ' + rm);
    else toast('Фото удалено. На сайте обновится в течение минуты');
    onChanged();
  };

  const create = async () => {
    if (!groupId) return toast('Не найдена группа добавок');
    const parsed = extraSchema.safeParse({ name: newName, name_kk: newNameKk, price: newPrice });
    if (!parsed.success) return toast(parsed.error.issues[0].message);
    setBusy(true);
    const order = extras.reduce((m, x) => Math.max(m, x.sort_order), 0) + 10;
    const { data, error } = await sb().from('product_extras').insert({
      group_id: groupId, slug: slugify(parsed.data.name), name: parsed.data.name, name_kk: parsed.data.name_kk || null, price_kzt: Number(parsed.data.price), sort_order: order,
    }).select('id').single();
    if (error || !data) { setBusy(false); return toast(errText(error?.message)); }
    let photoOk = true;
    if (newPhoto) {
      let path: string | null = null;
      try {
        path = await uploadExtraImage(newPhoto.blob, data.id as string);
        const u = await sb().from('product_extras').update({ image_path: path }).eq('id', data.id);
        if (u.error) throw new Error(errText(u.error.message));
      } catch (x) {
        photoOk = false;
        if (path) await removeProductImage(path);
        toast((x as Error).message + '. Добавка создана — загрузите фото в её строке');
      }
    }
    setBusy(false);
    setNewName(''); setNewNameKk(''); setNewPrice(''); setNewPhoto(null);
    if (photoOk) toast('Добавка создана');
    onChanged();
  };

  return (
    <>
      <div style={{ marginTop: 28, fontWeight: 800, fontSize: 15 }}>Добавки к бургерам</div>
      <Panel style={{ marginTop: 12, paddingTop: 8, paddingBottom: 8 }}>
        <div style={{ fontSize: 12, color: '#6B6258', fontWeight: 600, paddingTop: 10 }}>Фото, название на русском и казахском (ҚАЗ), цена и видимость. Фото котлет «говяжья» и «куриная» загружаются здесь.</div>
        {extras.map((e) => (
          <ExtraRow key={`${e.id}:${e.name}:${e.name_kk ?? ''}:${e.price_kzt}`} e={e} busy={busy} onSaved={onChanged}
            onActive={(v) => setActive(e, v)} onFile={(f) => pick(e, f)} onDeletePhoto={() => deletePhoto(e)} />
        ))}
        {!extras.length && <div style={{ padding: '14px 0', fontWeight: 700, fontSize: 13 }}>Добавок пока нет.</div>}
      </Panel>

      <Panel style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Новая добавка</div>
        <div className="apr-extra-new">
          <input className="field" value={newName} maxLength={80} placeholder="Название" aria-label="Название новой добавки" onChange={(x) => setNewName(x.target.value)} />
          <KkWrap><input className="field" value={newNameKk} maxLength={80} placeholder="Атауы (необязательно)" aria-label="Название новой добавки (казахский)" onChange={(x) => setNewNameKk(x.target.value)} /></KkWrap>
          <input className="field" value={newPrice} inputMode="numeric" placeholder="Цена ₸" aria-label="Цена новой добавки, ₸" onChange={(x) => setNewPrice(x.target.value.replace(/\D/g, '').slice(0, 7))} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 64, height: 64, borderRadius: 14, background: '#FFF1E0', overflow: 'hidden', flex: 'none' }}>
            {newPhoto ? <span role="img" aria-label="Выбранное фото" style={{ display: 'block', width: '100%', height: '100%', backgroundImage: `url(${newPhoto.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} /> : <ProductImg path={null} />}
          </div>
          <label className="btn apr-small-btn" style={{ ...darkBtn, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}>
            {newPhoto ? 'Другое фото' : 'Выбрать фото (необязательно)'}
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} aria-label="Выбрать фото новой добавки" style={{ display: 'none' }}
              onChange={(x) => { const f = x.target.files?.[0]; x.target.value = ''; if (!f) return; const m = validateImageFile(f); if (m) return toast(m); setNewFile(f); }} />
          </label>
          {newPhoto && <button type="button" className="btn apr-small-btn" onClick={() => setNewPhoto(null)} style={sandBtn}>Убрать фото</button>}
          <div style={{ flex: 1 }} />
          <button type="button" className="btn primary" disabled={busy || !groupId} onClick={create} style={{ height: 48, padding: '0 24px', borderRadius: 24 }}>{busy ? <Spinner /> : '+ Добавить'}</button>
        </div>
      </Panel>

      {pending && <ImageEditor file={pending.file} onCancel={cancelPending} onDone={(blob) => { const e = pending.extra; setPending(null); upload(blob, e); }} />}
      {newFile && <ImageEditor file={newFile} onCancel={cancelNewFile} onDone={(blob) => { setNewPhoto({ blob, url: URL.createObjectURL(blob) }); setNewFile(null); }} />}
    </>
  );
}
