import { Suspense } from 'react';
import { CatalogProvider } from '@/components/CatalogProvider';
import { BottomNav } from '@/components/BottomNav';
import { DesktopHeader } from '@/components/customer/DesktopHeader';
import { Toast } from '@/components/ui';
import { loadCatalog } from '@/features/catalog/load';

function PageFallback() {
  return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <span className="spinner dark-s" aria-label="Загрузка" />
    </div>
  );
}

// Always fresh per request (catalog is memo-cached in loadCatalog).
export const dynamic = 'force-dynamic';

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const catalog = await loadCatalog();
  return (
    <CatalogProvider value={catalog}>
      <div className="app-frame">
        <Toast />
        <Suspense>
          <DesktopHeader />
        </Suspense>
        <main className="app-main">
          <Suspense fallback={<PageFallback />}>{children}</Suspense>
        </main>
        <Suspense>
          <BottomNav />
        </Suspense>
      </div>
    </CatalogProvider>
  );
}
