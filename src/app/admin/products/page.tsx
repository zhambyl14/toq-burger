'use client';
import { useCallback, useEffect, useState } from 'react';
import { ImageEditor } from '@/components/admin/ImageEditor';
import { Drawer, Label, PageHead, Panel, TableWrap, Toggle, useAdminBranches } from '@/components/admin/kit';
import { ProductImg, Spinner, toast } from '@/components/ui';
import { PHOTO_UPDATED_TOAST, priceSchema, productSchema, removeProductImage, slugify, uploadProductImage, validateImageFile, type AdminCategory, type AdminExtra, type AdminProduct, type AdminVariant } from '@/features/admin/catalog';
import { errText } from '@/features/admin/transitions';
import { meatName } from '@/features/catalog/hooks';
import { sb } from '@/lib/supabase/client';
import type { Meat } from '@/types/catalog';

function PriceCell({ v, onSaved }: { v: AdminVariant; onSaved: () => void }) {
  const [val, setVal] = useState(v.price_kzt == null ? '' : String(v.price_kzt));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const cur = v.price_kzt == null ? '' : String(v.price_kzt);
    if (val === cur) return;
    const p = priceSchema.safeParse(val);
    if (!p.success) { toast(p.error.issues[0].message); setVal(cur); return; }
    setBusy(true);
    const { error } = await sb().from('product_variants').update({ price_kzt: val === '' ? null : Number(val) }).eq('id', v.id);
    setBusy(false);
    if (error) { toast(errText(error.message)); setVal(cur); return; }
    toast(val === '' ? 'Цена снята — позиция «цена уточняется»' : 'Цена сохранена');
    onSaved();
  };
  return (
    <input value={val} inputMode="numeric" aria-label="Цена, ₸" placeholder="—" disabled={busy}
      onChange={(e) => setVal(e.target.value.replace(/\D/g, '').slice(0, 7))} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      style={{ width: 100, height: 40, borderRadius: 12, border: '2px solid #F3EADF', padding: '0 10px', fontSize: 14, fontWeight: 800, outline: 'none' }} />
  );
}

export default function AdminProducts() {
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [extras, setExtras] = useState<AdminExtra[]>([]);
  const [edit, setEdit] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newCat, setNewCat] = useState('');
  const [adding, setAdding] = useState(false);
  const [newTagline, setNewTagline] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPhoto, setNewPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);
  const photoUrl = newPhoto?.url;
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);
  const cancelNewFile = useCallback(() => setNewFile(null), []);

  const load = useCallback(async () => {
    const [p, c, e] = await Promise.all([
      sb().from('products').select('id,slug,name,tagline,description,ingredients,image_path,extra_group_id,is_active,sort_order,category_id,product_variants(id,product_id,meat,label,price_kzt,nutrition,image_path,is_active)').order('sort_order'),
      sb().from('product_categories').select('id,slug,name,sort_order').order('sort_order'),
      sb().from('product_extras').select('id,group_id,slug,name,price_kzt,is_active,sort_order').order('sort_order'),
    ]);
    if (p.error || c.error || e.error) toast(errText((p.error ?? c.error ?? e.error)?.message));
    setProducts((p.data as AdminProduct[]) ?? []);
    const cl = (c.data as AdminCategory[]) ?? [];
    setCats(cl);
    setNewCat((x) => x || cl.find((k) => k.slug === 'sides')?.id || cl[0]?.id || '');
    setExtras((e.data as AdminExtra[]) ?? []);
  }, []);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const setActive = async (table: 'products' | 'product_variants' | 'product_extras', id: string, v: boolean) => {
    const { error } = await sb().from(table).update({ is_active: v }).eq('id', id);
    if (error) return toast(errText(error.message));
    toast(v ? 'Включено' : 'Скрыто из меню');
    load();
  };

  const remove = async (p: AdminProduct) => {
    if (!confirm(`Удалить «${p.name}»? Если товар уже заказывали, лучше просто скрыть его.`)) return;
    const { error } = await sb().from('products').delete().eq('id', p.id);
    if (error) { toast('Нельзя удалить — товар используется в корзинах/заказах. Скрываю.'); await setActive('products', p.id, false); return; }
    toast('Удалено');
    load();
  };

  const addProduct = async () => {
    const name = newName.trim();
    if (!name) return toast('Укажите название');
    const pr = priceSchema.safeParse(newPrice);
    if (!pr.success) return toast(pr.error.issues[0].message);
    if (!newCat) return toast('Выберите категорию');
    setAdding(true);
    const { data, error } = await sb().from('products').insert({ slug: slugify(name), name, category_id: newCat, sort_order: 100, tagline: newTagline.trim() || null, description: newDesc.trim() || null }).select('id').single();
    if (error || !data) { setAdding(false); return toast(errText(error?.message)); }
    const v = await sb().from('product_variants').insert({ product_id: data.id, meat: 'one', label: 'порция', price_kzt: newPrice === '' ? null : Number(newPrice) });
    if (v.error) { setAdding(false); load(); return toast(errText(v.error.message)); }
    let photoOk = true;
    if (newPhoto) {
      try {
        const path = await uploadProductImage(newPhoto.blob, data.id as string);
        const u = await sb().from('products').update({ image_path: path }).eq('id', data.id);
        if (u.error) { await removeProductImage(path); throw new Error(errText(u.error.message)); }
      } catch (e) {
        photoOk = false;
        toast((e as Error).message + '. Продукт создан — загрузите фото в карточке');
      }
    }
    setAdding(false);
    setNewName(''); setNewPrice(''); setNewTagline(''); setNewDesc(''); setNewPhoto(null);
    if (photoOk) toast(newPhoto ? 'Продукт добавлен с фото. На сайте появится в течение минуты' : 'Продукт добавлен');
    load();
    setEdit(data.id as string);
  };

  if (!products) return <><PageHead title="Меню и цены" /><div style={{ padding: 60, textAlign: 'center' }}><Spinner dark /></div></>;

  return (
    <>
      <PageHead title="Меню и цены" />
      {cats.map((c) => {
        const list = products.filter((p) => p.category_id === c.id);
        if (!list.length) return null;
        return (
          <div key={c.id} style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{c.name}</div>
            <TableWrap>
              <thead><tr><th></th><th>Продукт</th><th>Вариант</th><th>Цена, ₸</th><th>Активен</th><th></th></tr></thead>
              <tbody>
                {list.flatMap((p) => {
                  const vs = [...p.product_variants].sort((a, b) => (a.meat > b.meat ? 1 : -1));
                  return vs.map((v, i) => (
                    <tr key={v.id} style={{ opacity: p.is_active ? 1 : 0.55 }}>
                      <td style={{ width: 56 }}>{i === 0 && <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FFF1E0', overflow: 'hidden' }}><ProductImg path={v.image_path ?? p.image_path} /></div>}</td>
                      <td>{i === 0 && <><b>{p.name}</b>{!p.is_active && <div style={{ fontSize: 12, color: '#B3261E', fontWeight: 800 }}>скрыт</div>}</>}</td>
                      <td>{v.meat === 'one' ? v.label : meatName(v.meat)}</td>
                      <td><PriceCell key={`${v.id}:${v.price_kzt}`} v={v} onSaved={load} /></td>
                      <td><Toggle on={v.is_active} label={`Активность варианта ${p.name}`} onChange={(x) => setActive('product_variants', v.id, x)} /></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{i === 0 && (
                        <>
                          <button className="btn" onClick={() => setEdit(p.id)} style={{ minHeight: 40, padding: '0 12px', borderRadius: 12, background: '#141210', color: '#fff', fontWeight: 800, fontSize: 13, marginRight: 6 }}>Изменить</button>
                          <button className="btn" onClick={() => remove(p)} style={{ minHeight: 40, padding: '0 12px', borderRadius: 12, background: '#F3EADF', color: '#B3261E', fontWeight: 800, fontSize: 13 }}>Удалить</button>
                        </>
                      )}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </TableWrap>
          </div>
        );
      })}

      <div style={{ marginTop: 20, fontWeight: 800, fontSize: 15 }}>Добавки к бургерам</div>
      <TableWrap>
        <thead><tr><th>Добавка</th><th>Цена, ₸</th><th>Активна</th></tr></thead>
        <tbody>
          {extras.map((e) => (
            <tr key={e.id}><td><b>{e.name}</b></td><td><ExtraPrice key={`${e.id}:${e.price_kzt}`} e={e} onSaved={load} /></td><td><Toggle on={e.is_active} label={`Активность ${e.name}`} onChange={(x) => setActive('product_extras', e.id, x)} /></td></tr>
          ))}
        </tbody>
      </TableWrap>

      <Panel style={{ marginTop: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Добавить товар</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Название нового продукта" aria-label="Новый продукт" className="field" style={{ flex: 1, minWidth: 200, height: 48, borderRadius: 16 }} />
          <select className="field" value={newCat} onChange={(e) => setNewCat(e.target.value)} aria-label="Категория" style={{ width: 200, height: 48, borderRadius: 16 }}>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={newPrice} onChange={(e) => setNewPrice(e.target.value.replace(/\D/g, '').slice(0, 7))} placeholder="Цена ₸" aria-label="Цена" inputMode="numeric" className="field" style={{ width: 120, height: 48, borderRadius: 16 }} />
        </div>
        <input value={newTagline} onChange={(e) => setNewTagline(e.target.value.slice(0, 120))} placeholder="Подзаголовок" aria-label="Подзаголовок" className="field" style={{ marginTop: 10, height: 48, borderRadius: 16 }} />
        <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value.slice(0, 1000))} placeholder="Описание" aria-label="Описание" rows={2} className="field" style={{ marginTop: 10, height: 'auto', padding: 12, borderRadius: 16 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 64, height: 64, borderRadius: 14, background: '#FFF1E0', overflow: 'hidden', flex: 'none' }}>
            {newPhoto ? <span aria-label="Выбранное фото" role="img" style={{ display: 'block', width: '100%', height: '100%', backgroundImage: `url(${newPhoto.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} /> : <ProductImg path={null} />}
          </div>
          <label className="btn" style={{ minHeight: 40, padding: '0 14px', borderRadius: 12, background: '#141210', color: '#fff', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            {newPhoto ? 'Другое фото' : 'Выбрать фото'}
            <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Выбрать фото нового товара" disabled={adding} style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const m = validateImageFile(f); if (m) return toast(m); setNewFile(f); }} />
          </label>
          {newPhoto && <button type="button" className="btn" onClick={() => setNewPhoto(null)} style={{ minHeight: 40, padding: '0 14px', borderRadius: 12, background: '#F3EADF', color: '#B3261E', fontWeight: 800, fontSize: 13 }}>Убрать фото</button>}
          <div style={{ flex: 1 }} />
          <button className="btn primary" disabled={adding} onClick={addProduct} style={{ height: 48, padding: '0 24px', borderRadius: 24 }}>{adding ? <Spinner /> : '+ Добавить'}</button>
        </div>
      </Panel>
      <div style={{ fontSize: 12, color: '#6B6258', marginTop: 10, fontWeight: 600 }}>Пустая цена = «Цена уточняется»: позиция видна в меню, но заказать её нельзя. Цены напитков не заданы владельцем — заполните при готовности.</div>

      {newFile && <ImageEditor file={newFile} onCancel={cancelNewFile} onDone={(blob) => { setNewPhoto({ blob, url: URL.createObjectURL(blob) }); setNewFile(null); }} />}
      {edit && <ProductEditor key={edit} id={edit} products={products} cats={cats} onClose={() => setEdit(null)} onSaved={load} />}
    </>
  );
}

function ExtraPrice({ e, onSaved }: { e: AdminExtra; onSaved: () => void }) {
  const [val, setVal] = useState(String(e.price_kzt));
  const save = async () => {
    if (val === String(e.price_kzt)) return;
    if (!/^\d{1,7}$/.test(val)) { toast('Цена — целое число'); setVal(String(e.price_kzt)); return; }
    const { error } = await sb().from('product_extras').update({ price_kzt: Number(val) }).eq('id', e.id);
    if (error) { toast(errText(error.message)); setVal(String(e.price_kzt)); return; }
    toast('Цена добавки сохранена');
    onSaved();
  };
  return (
    <input value={val} inputMode="numeric" aria-label={`Цена ${e.name}`} onChange={(x) => setVal(x.target.value.replace(/\D/g, '').slice(0, 7))} onBlur={save} onKeyDown={(x) => { if (x.key === 'Enter') (x.target as HTMLInputElement).blur(); }}
      style={{ width: 100, height: 40, borderRadius: 12, border: '2px solid #F3EADF', padding: '0 10px', fontSize: 14, fontWeight: 800, outline: 'none' }} />
  );
}

function ProductEditor({ id, products, cats, onClose, onSaved }: { id: string; products: AdminProduct[]; cats: AdminCategory[]; onClose: () => void; onSaved: () => void }) {
  const p = products.find((x) => x.id === id);
  const branches = useAdminBranches();
  // the editor is keyed by product id, so initial state is taken once per product
  const [f, setF] = useState(() => ({
    name: p?.name ?? '', tagline: p?.tagline ?? '', description: p?.description ?? '', ingredients: p?.ingredients.join(', ') ?? '',
    sort_order: String(p?.sort_order ?? 0), category_id: p?.category_id ?? '',
  }));
  const [active, setActiveP] = useState(p?.is_active ?? true);
  const [avail, setAvail] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pending, setPending] = useState<{ file: File; target: { variant?: AdminVariant } } | null>(null);

  useEffect(() => {
    sb().from('product_availability').select('branch_id,is_available').eq('product_id', id).then(({ data }) => {
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
      name: d.name, tagline: d.tagline || null, description: d.description || null,
      ingredients: d.ingredients.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20),
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

  const saveNutrition = async (v: AdminVariant, val: string) => {
    if ((v.nutrition ?? '') === val) return;
    const { error } = await sb().from('product_variants').update({ nutrition: val.trim().slice(0, 120) || null }).eq('id', v.id);
    if (error) return toast(errText(error.message));
    toast('КБЖУ сохранено');
    onSaved();
  };

  const fld = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const isBurger = cats.find((c) => c.id === p.category_id)?.slug === 'burgers';

  return (
    <Drawer open onClose={onClose} title={p.name}>
      <Panel>
        <Label>НАЗВАНИЕ</Label><input className="field" value={f.name} onChange={fld('name')} />
        <Label>ПОДЗАГОЛОВОК</Label><input className="field" value={f.tagline} onChange={fld('tagline')} />
        <Label>ОПИСАНИЕ</Label><textarea className="field" value={f.description} onChange={fld('description')} rows={3} style={{ height: 'auto', padding: 12 }} />
        <Label>СОСТАВ (через запятую)</Label><input className="field" value={f.ingredients} onChange={fld('ingredients')} />
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><Label>КАТЕГОРИЯ</Label><select className="field" value={f.category_id} onChange={fld('category_id')}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div style={{ width: 120 }}><Label>ПОРЯДОК</Label><input className="field" value={f.sort_order} onChange={fld('sort_order')} inputMode="numeric" /></div>
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
        <div style={{ fontWeight: 800, fontSize: 15 }}>Варианты</div>
        {p.product_variants.map((v) => (
          <div key={v.id} style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>{v.meat === 'one' ? v.label : meatName(v.meat)} — цена меняется в таблице</div>
            <input className="field" defaultValue={v.nutrition ?? ''} placeholder="КБЖУ, например «Б 41 · Ж 62 · У 53 · 934 ккал»" aria-label="КБЖУ" onBlur={(e) => saveNutrition(v, e.target.value)} style={{ marginTop: 6 }} />
          </div>
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

function PhotoRow({ label, path, disabled, onFile, onDelete }: { label: string; path: string | null; disabled: boolean; onFile: (f: File | undefined) => void; onDelete: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
      <div style={{ width: 64, height: 64, borderRadius: 14, background: '#FFF1E0', overflow: 'hidden', flex: 'none' }}><ProductImg path={path} /></div>
      <div style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{label}<div style={{ fontSize: 11, color: '#6B6258' }}>{path ?? 'не загружено'}</div></div>
      <label className="btn" style={{ minHeight: 40, padding: '0 14px', borderRadius: 12, background: '#141210', color: '#fff', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
        Загрузить
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} style={{ display: 'none' }} />
      </label>
      {path && <button type="button" className="btn" disabled={disabled} onClick={onDelete} aria-label={`Удалить фото: ${label}`} style={{ minHeight: 40, padding: '0 12px', borderRadius: 12, background: '#F3EADF', color: '#B3261E', fontWeight: 800, fontSize: 13 }}>Удалить фото</button>}
    </div>
  );
}
