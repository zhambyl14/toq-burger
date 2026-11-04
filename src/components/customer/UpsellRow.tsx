'use client';
import '@/styles/product.css';
import { useCatalog } from '@/components/CatalogProvider';
import { ProductImg, toast } from '@/components/ui';
import { defaultMeat, useMounted, variantImage } from '@/features/catalog/hooks';
import { lineKey } from '@/features/cart/pricing';
import { useLang } from '@/i18n/LangProvider';
import { useApp } from '@/stores/app';
import type { Product } from '@/types/catalog';
import { BoltMark } from './BoltMark';
import { PriceTag } from './PriceTag';

const MAX_QTY = 50;

function UpsellCard({ item }: { item: Product }) {
  const { t, tx } = useLang();
  const meat = defaultMeat(item);
  const price = item.variants.find((v) => v.meat === meat)?.price ?? null;
  const key = lineKey(item.id, meat, []);
  const mounted = useMounted();
  const inCart = useApp((s) => s.cart.find((c) => c.key === key)?.qty ?? 0);
  const add = useApp((s) => s.add);
  const changeQty = useApp((s) => s.qty);
  const n = mounted ? inCart : 0;
  const name = tx(item.name, item.nameKk);

  const quickAdd = () => {
    add({ productId: item.id, meat, qty: 1, extraIds: [] });
    toast(`${name} ${t('добавлен', 'қосылды')}`);
  };

  return (
    <div className="pd-up-card lift">
      <div className="pd-up-photo">
        <div style={{ position: 'absolute', inset: 6 }}>
          <ProductImg path={variantImage(item, meat)} alt={name} />
        </div>
        {price == null ? (
          <span className="pd-up-badge">{t('Скоро', 'Жақында')}</span>
        ) : n > 0 ? (
          <div className="pd-up-stepper">
            <button type="button" className="btn pd-up-sbtn" aria-label={`${t('Убрать', 'Азайту')}: ${name}`} onClick={() => changeQty(key, -1)}>−</button>
            <span className="pd-up-n" aria-live="polite">{n}</span>
            <button type="button" className="btn pd-up-sbtn pd-up-sbtn--plus" aria-label={`${t('Добавить ещё', 'Тағы қосу')}: ${name}`} disabled={n >= MAX_QTY} onClick={() => changeQty(key, 1)}>+</button>
          </div>
        ) : (
          <button type="button" className="btn primary pd-up-add" aria-label={`${t('Добавить', 'Қосу')}: ${name}`} onClick={quickAdd}>+</button>
        )}
      </div>
      <div className="pd-up-body">
        <div className="pd-up-name">{name}</div>
        <div className="pd-up-price">
          <PriceTag amount={price} size={15} color="#141210" />
        </div>
      </div>
    </div>
  );
}

/** «Добавьте к заказу»: photo cards. Burgers get sides + sauces + drinks; other products get drinks + the other sides. */
export function UpsellRow({ product }: { product: Product }) {
  const { products } = useCatalog();
  const { t } = useLang();
  const others = products.filter((x) => x.id !== product.id);
  const sides = others.filter((x) => x.category === 'sides');
  const sauces = others.filter((x) => x.category === 'sauces');
  const drinks = others.filter((x) => x.category === 'drinks');
  const items = product.category === 'burgers' ? [...sides, ...sauces, ...drinks] : [...drinks, ...sides];
  if (!items.length) return null;

  const title = t('Добавьте к заказу', 'Тапсырысқа қосыңыз');
  return (
    <section aria-label={title} className="pd-up">
      <div className="pd-h" style={{ marginTop: 0 }}>
        <BoltMark size={20} className="pd-h-bolt" />
        <span>{title}</span>
      </div>
      <div className="pd-up-row scr">
        {items.map((r) => <UpsellCard key={r.id} item={r} />)}
      </div>
    </section>
  );
}
