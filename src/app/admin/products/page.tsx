'use client';
import { useCallback, useEffect, useState } from 'react';
import { ImageEditor } from '@/components/admin/ImageEditor';
import { PageHead, Panel, TableWrap, Toggle } from '@/components/admin/kit';
import { ProductImg, Spinner, toast } from '@/components/ui';
import { priceSchema, removeProductImage, slugify, uploadProductImage, validateImageFile, type AdminCategory, type AdminExtra, type AdminProduct, type AdminVariant } from '@/features/admin/catalog';
import { errText } from '@/features/admin/transitions';
import { meatName } from '@/features/catalog/hooks';
import { sb } from '@/lib/supabase/client';
import '@/styles/admin-products.css';
import { ExtrasSection } from './ExtrasSection';
import { ProductEditor } from './ProductEditor';

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
      sb().from('products').select('id,slug,name,name_kk,tagline,tagline_kk,description,description_kk,ingredients,ingredients_kk,image_path,extra_group_id,is_active,sort_order,category_id,product_variants(id,product_id,meat,label,label_kk,price_kzt,nutrition,nutrition_kk,image_path,is_active)').order('sort_order'),
      sb().from('product_categories').select('id,slug,name,sort_order').order('sort_order'),
      sb().from('product_extras').select('id,group_id,slug,name,name_kk,price_kzt,image_path,is_active,sort_order').order('sort_order'),
    ]);
    if (p.error || c.error || e.error) toast(errText((p.error ?? c.error ?? e.error)?.message));
    setProducts((p.data as AdminProduct[]) ?? []);
    const cl = (c.data as AdminCategory[]) ?? [];
    setCats(cl);
    setNewCat((x) => x || cl.find((k) => k.slug === 'sides')?.id || cl[0]?.id || '');
    setExtras((e.data as AdminExtra[]) ?? []);
  }, []);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const setActive = async (table: 'products' | 'product_variants', id: string, v: boolean) => {
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
      <ExtrasSection extras={extras} onChanged={load} />
      {edit && <ProductEditor key={edit} id={edit} products={products} cats={cats} onClose={() => setEdit(null)} onSaved={load} />}
    </>
  );
}
