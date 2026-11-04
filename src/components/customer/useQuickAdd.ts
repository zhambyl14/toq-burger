'use client';
import { useCallback } from 'react';
import { toast } from '@/components/ui';
import { defaultMeat } from '@/features/catalog/hooks';
import { useLang } from '@/i18n/LangProvider';
import { useApp } from '@/stores/app';
import type { Product } from '@/types/catalog';
import { showSnack } from './snack';

/** One-tap add of the default variant. Burgers offer «Изменить» (meat/extras), other items offer the cart. */
export function useQuickAdd() {
  const add = useApp((s) => s.add);
  const { t, tx } = useLang();
  return useCallback((p: Product): boolean => {
    const meat = defaultMeat(p);
    const v = p.variants.find((x) => x.meat === meat);
    if (!v || v.price == null) { toast(t('Сейчас недоступно', 'Қазір қолжетімсіз')); return false; }
    add({ productId: p.id, meat, qty: 1, extraIds: [] });
    const name = tx(p.name, p.nameKk);
    const inCart = t(`${name} в корзине`, `${name} себетте`);
    if (p.category === 'burgers') showSnack(inCart, `/product/${p.slug}`, t('Изменить', 'Өзгерту'));
    else showSnack(inCart, '/cart', t('В корзину', 'Себетке'));
    return true;
  }, [add, t, tx]);
}
