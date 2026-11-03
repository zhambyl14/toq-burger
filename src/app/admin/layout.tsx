import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';

export const metadata: Metadata = { title: 'TOK BURGER — Админ-панель', robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
