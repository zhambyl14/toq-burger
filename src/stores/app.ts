'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { addLine, changeQty, replaceLine, switchMeat, type CartLine } from '@/features/cart/pricing';
import type { Extra, Meat } from '@/types/catalog';

export interface DeliveryAddress {
  lat: number;
  lon: number;
  label: string;
}

export interface AddressDetails {
  apt: string;
  ent: string;
  floor: string;
  intercom: string;
  instr: string;
}

interface AppState {
  cart: CartLine[];
  bump: number;
  note: string;
  promo: string;
  address: DeliveryAddress | null;
  details: AddressDetails;
  mode: 'DELIVERY' | 'PICKUP';
  pickupBranchId: string | null;
  favs: string[]; // product ids
  pendingOrderKey: string | null; // idempotency key for the checkout in progress
  add: (item: { productId: string; meat: Meat; qty: number; extraIds: string[] }) => void;
  qty: (key: string, d: number) => void;
  remove: (key: string) => void;
  /** `extras` (the catalog) lets the extra patty follow the new meat. */
  switchMeat: (key: string, meat: Meat, extras?: Extra[]) => void;
  /** Cart «edit»: replaces the line `oldKey` with a new configuration. */
  replace: (oldKey: string, item: { productId: string; meat: Meat; qty: number; extraIds: string[] }) => void;
  clearCart: () => void;
  set: (p: Partial<Pick<AppState, 'note' | 'promo' | 'address' | 'mode' | 'pickupBranchId' | 'favs' | 'pendingOrderKey'>>) => void;
  setDetail: (k: keyof AddressDetails, v: string) => void;
  toggleFav: (productId: string) => boolean;
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      cart: [],
      bump: 0,
      note: '',
      promo: '',
      address: null,
      details: { apt: '', ent: '', floor: '', intercom: '', instr: '' },
      mode: 'DELIVERY',
      pickupBranchId: null,
      favs: [],
      pendingOrderKey: null,
      add: (item) => set((s) => ({ cart: addLine(s.cart, item), bump: s.bump + 1, pendingOrderKey: null })),
      qty: (key, d) => set((s) => ({ cart: changeQty(s.cart, key, d), pendingOrderKey: null })),
      remove: (key) => set((s) => ({ cart: s.cart.filter((c) => c.key !== key), pendingOrderKey: null })),
      switchMeat: (key, meat, extras) => set((s) => ({ cart: switchMeat(s.cart, key, meat, extras), pendingOrderKey: null })),
      replace: (oldKey, item) => set((s) => ({ cart: replaceLine(s.cart, oldKey, item), pendingOrderKey: null })),
      clearCart: () => set({ cart: [], note: '', promo: '', pendingOrderKey: null }),
      set: (p) => set(p),
      setDetail: (k, v) => set((s) => ({ details: { ...s.details, [k]: v } })),
      toggleFav: (id) => {
        const on = !get().favs.includes(id);
        set((s) => ({ favs: on ? [...s.favs, id] : s.favs.filter((x) => x !== id) }));
        return on;
      },
    }),
    { name: 'tok-burger', version: 1, partialize: (s) => ({ ...s, bump: 0 }) },
  ),
);

/** Tiny global toast; auto-hides after 2.3 s. */
interface ToastState { text: string; id: number; show: (t: string) => void }
let toastTimer: ReturnType<typeof setTimeout> | null = null;
export const useToast = create<ToastState>((set) => ({
  text: '',
  id: 0,
  show: (text) => {
    if (toastTimer) clearTimeout(toastTimer);
    set((s) => ({ text, id: s.id + 1 }));
    toastTimer = setTimeout(() => set({ text: '' }), 2300);
  },
}));
