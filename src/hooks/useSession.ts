'use client';
import { useSyncExternalStore } from 'react';
import type { User } from '@supabase/supabase-js';
import { sb, supabaseConfigured } from '@/lib/supabase/client';

export type Role = 'CUSTOMER' | 'KITCHEN' | 'OPERATOR' | 'COURIER' | 'ADMIN';

interface SessionState {
  ready: boolean;
  user: User | null;
  phone: string | null;
  roles: Role[];
}

let cache: SessionState = { ready: false, user: null, phone: null, roles: [] };
const listeners = new Set<(s: SessionState) => void>();
let started = false;

async function refresh(user: User | null) {
  let roles: Role[] = [];
  let phone: string | null = null;
  if (user) {
    const [r, p] = await Promise.all([
      sb().rpc('my_roles'),
      sb().from('profiles').select('phone').eq('id', user.id).maybeSingle(),
    ]);
    roles = (r.data as Role[] | null) ?? [];
    phone = (p.data?.phone as string | undefined) ?? (user.app_metadata?.phone as string | undefined) ?? null;
  }
  cache = { ready: true, user, phone, roles };
  listeners.forEach((l) => l(cache));
}

function start() {
  if (started) return;
  started = true;
  if (!supabaseConfigured()) {
    cache = { ready: true, user: null, phone: null, roles: [] };
    return;
  }
  sb().auth.getUser().then(({ data }) => refresh(data.user));
  sb().auth.onAuthStateChange((evt, session) => {
    if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT' || evt === 'USER_UPDATED') refresh(session?.user ?? null);
  });
}

function subscribe(cb: () => void) {
  const l = () => cb();
  listeners.add(l);
  start();
  return () => {
    listeners.delete(l);
  };
}
const SERVER: SessionState = { ready: false, user: null, phone: null, roles: [] };

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, () => cache, () => SERVER);
}

export function homeForRoles(roles: Role[]): string {
  if (roles.includes('ADMIN')) return '/admin';
  if (roles.includes('KITCHEN') || roles.includes('OPERATOR')) return '/kitchen';
  if (roles.includes('COURIER')) return '/courier';
  return '/';
}

export async function signOut() {
  await sb().auth.signOut();
}
