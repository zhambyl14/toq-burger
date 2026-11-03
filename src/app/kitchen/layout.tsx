import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Toast } from '@/components/ui';

export const metadata: Metadata = { title: 'TOK BURGER — Кухня', robots: { index: false } };

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="staff-frame">
      <Toast />
      <Suspense>{children}</Suspense>
    </div>
  );
}
