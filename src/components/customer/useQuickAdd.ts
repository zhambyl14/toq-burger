'use client';
import { useCallback } from 'react';
import { toast } from '@/components/ui';
import { defaultMeat } from '@/features/catalog/hooks';
import { useApp } from '@/stores/app';
import type { Product } from '@/types/catalog';
import { showSnack } from './snack';

/** One-tap add of the default variant. Burgers offer «Изменить» (meat/extras), other items offer the cart. */
export function useQuickAdd() {
  const add = useApp((s) => s.add);
  return useCallback((p: Product): boolean => {
    const meat = defaultMeat(p);
    const v = p.variants.find((x) => x.meat === meat);
    if (!v || v.price == null) { toast('Сейчас недоступно'); return false; }
    add({ productId: p.id, meat, qty: 1, extraIds: [] });
    if (p.category === 'burgers') showSnack(`${p.name} в корзине`, `/product/${p.slug}`, 'Изменить');
    else showSnack(`${p.name} в корзине`, '/cart', 'В корзину');
    return true;
  }, [add]);
}
