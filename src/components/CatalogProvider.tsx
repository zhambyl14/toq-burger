'use client';
import { createContext, useContext } from 'react';
import type { Catalog } from '@/types/catalog';

const Ctx = createContext<Catalog>({ configured: false, products: [], extras: [], branches: [], hours: [], area: [] });

export function CatalogProvider({ value, children }: { value: Catalog; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCatalog(): Catalog {
  return useContext(Ctx);
}
