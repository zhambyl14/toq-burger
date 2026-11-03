'use client';
import { useMemo } from 'react';
import { useCatalog } from '@/components/CatalogProvider';
import { useApp } from '@/stores/app';
import { pickDeliveryBranch, type BranchPick } from './assign';
import type { Branch } from '@/types/catalog';

export interface Quote {
  mode: 'DELIVERY' | 'PICKUP';
  branch: Branch | null;
  fee: number;
  pick: BranchPick | null;
}

export function useQuote(at?: Date): Quote {
  const { branches, hours } = useCatalog();
  const address = useApp((s) => s.address);
  const mode = useApp((s) => s.mode);
  const pickupId = useApp((s) => s.pickupBranchId);
  const t = at?.getTime();
  return useMemo(() => {
    if (mode === 'PICKUP') {
      const b = branches.find((x) => x.id === pickupId) ?? null;
      return { mode, branch: b, fee: 0, pick: null };
    }
    if (!address) return { mode, branch: null, fee: 0, pick: null };
    const pick = pickDeliveryBranch(address, branches, hours, t ? new Date(t) : new Date());
    return { mode, branch: pick.branch, fee: pick.branch?.delivery_fee_kzt ?? 0, pick };
  }, [mode, pickupId, address, branches, hours, t]);
}
