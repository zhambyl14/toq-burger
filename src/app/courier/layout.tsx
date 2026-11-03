import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Toast } from '@/components/ui';

export const metadata: Metadata = { title: 'TOK BURGER — Курьер', robots: { index: false } };

export default function CourierLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', background: '#0B0A09' }}>
      <Toast />
      <Suspense>{children}</Suspense>
    </div>
  );
}
