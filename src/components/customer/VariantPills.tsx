'use client';
import { pillLabel } from '@/features/catalog/hooks';
import { useLang } from '@/i18n/LangProvider';
import type { Product } from '@/types/catalog';
import { PricePill } from './PricePill';

/**
 * Instagram-style price pills for a list card: one black+orange pill per priced variant
 * (burger with chicken and beef shows both); items without a price show a "price clarified" pill.
 * Labels are brand-native bilingual (kk + ru) in every UI language.
 */
export function VariantPills({ product, className = 'hm-pills' }: { product: Product; className?: string }) {
  const { t } = useLang();
  const priced = product.variants.filter((v) => v.price != null);
  const list = priced.length ? priced : product.variants.slice(0, 1);
  if (!list.length) return null;
  return (
    <div className={className}>
      {list.map((v) => {
        const l = pillLabel(v);
        if (v.price == null) {
          const same = l.kk.trim().toLowerCase() === l.ru.trim().toLowerCase();
          const soon = t('Цена уточняется', 'Бағасы нақтылануда');
          return (
            <span key={v.id} role="text" aria-label={`${same ? l.ru : `${l.kk} / ${l.ru}`}: ${soon}`} className="hm-pill-soon">
              <span>{same ? <span>{l.ru}</span> : <><span>{l.kk}</span><span>{l.ru}</span></>}</span>
              <span aria-hidden="true">{soon}</span>
            </span>
          );
        }
        return <PricePill key={v.id} kk={l.kk} ru={l.ru} price={v.price} />;
      })}
    </div>
  );
}
