'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Logo, Spinner, Toast } from '@/components/ui';
import { signOut, useSession } from '@/hooks/useSession';
import { supabaseConfigured } from '@/lib/supabase/client';

const MOD_NAV = ['/admin/orders', '/admin/support'];
const NAV: [string, string][] = [
  ['/admin', 'Обзор и аналитика'],
  ['/admin/orders', 'Заказы'],
  ['/admin/products', 'Меню и цены'],
  ['/admin/branches', 'Филиалы'],
  ['/admin/staff', 'Сотрудники и роли'],
  ['/admin/dispatch', 'Диспетчеризация'],
  ['/admin/promotions', 'Промокоды'],
  ['/admin/customers', 'Клиенты'],
  ['/admin/support', 'Поддержка'],
  ['/admin/audit', 'Журнал действий'],
];

const CSS = `
.admin-wrap{min-height:100dvh;background:#F3EADF;display:flex}
.admin-side{flex:0 0 240px;background:#141210;color:#fff;padding:20px 14px;box-sizing:border-box;display:flex;flex-direction:column;gap:6px;position:sticky;top:0;height:100dvh;overflow-y:auto}
.admin-main{flex:1 1 640px;min-width:0;padding:28px 32px;box-sizing:border-box;animation:up .3s ease both}
.admin-table td,.admin-table th{padding:12px 14px;text-align:left;font-size:14px;border-bottom:1px solid #F3EADF;vertical-align:middle}
.admin-table th{font-size:12px;color:#6B6258;font-weight:800;white-space:nowrap}
.admin-table tr.click{cursor:pointer}.admin-table tr.click:hover td{background:#FFF8F0}
.admin-grid4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.admin-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.admin-grid32{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:16px}
.admin-scroll-x{scrollbar-width:none}.admin-scroll-x::-webkit-scrollbar{display:none}
@media (max-width:1024px){.admin-side{flex-basis:200px}.admin-main{padding:20px}.admin-grid4{grid-template-columns:repeat(2,minmax(0,1fr))}.admin-grid32{grid-template-columns:1fr}}
@media (max-width:760px){.admin-wrap{flex-direction:column}.admin-side{position:sticky;top:0;z-index:30;height:auto;flex:none;flex-direction:row;align-items:center;overflow-x:auto;padding:10px 12px;gap:6px}.admin-side .admin-brand-text,.admin-side .admin-foot{display:none}.admin-side .admin-brand{padding:0 6px 0 0}.admin-side a{flex:none;white-space:nowrap}.admin-main{padding:16px}.admin-grid2{grid-template-columns:1fr}.admin-grid4{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    if (session.ready && !session.user && supabaseConfigured()) router.replace('/auth?next=/admin');
  }, [session.ready, session.user, router]);

  const isAdmin = session.roles.includes('ADMIN');
  const isMod = !isAdmin && session.roles.includes('MODERATOR');
  const nav = isMod ? NAV.filter(([h]) => MOD_NAV.includes(h)) : NAV;
  const modAllowed = MOD_NAV.some((h) => path === h || path.startsWith(h + '/'));

  let body: React.ReactNode = children;
  if (!supabaseConfigured()) body = <Center>База данных не подключена.</Center>;
  else if (!session.ready || !session.user) body = <Center><Spinner dark /></Center>;
  else if (isMod && !modAllowed) {
    body = (
      <Center>
        <div className="disp" style={{ fontSize: 22, fontWeight: 800 }}>Нет доступа</div>
        <div style={{ fontSize: 14, color: '#6B6258', fontWeight: 600, marginTop: 8 }}>Модератору доступны только заказы и поддержка.</div>
        <Link href="/admin/orders" className="btn primary" style={{ display: 'inline-flex', alignItems: 'center', marginTop: 16, height: 48, padding: '0 24px', borderRadius: 24, textDecoration: 'none' }}>К заказам</Link>
      </Center>
    );
  } else if (!isAdmin && !isMod) {
    body = (
      <Center>
        <div className="disp" style={{ fontSize: 22, fontWeight: 800 }}>Нет доступа</div>
        <div style={{ fontSize: 14, color: '#6B6258', fontWeight: 600, marginTop: 8 }}>Админ-панель доступна только администраторам и модераторам.</div>
        <Link href="/" className="btn primary" style={{ display: 'inline-flex', alignItems: 'center', marginTop: 16, height: 48, padding: '0 24px', borderRadius: 24, textDecoration: 'none' }}>На главную</Link>
      </Center>
    );
  }

  return (
    <div className="admin-wrap">
      <style>{CSS}</style>
      <Toast />
      <nav className="admin-side" aria-label="Разделы админ-панели">
        <div className="admin-brand" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px 16px', flex: 'none' }}>
          <Logo />
          <div className="admin-brand-text"><div className="disp" style={{ fontSize: 16, fontWeight: 800 }}>TOK BURGER</div><div style={{ fontSize: 11, color: '#B9AFA3', fontWeight: 700 }}>Админ-панель</div></div>
        </div>
        {(isAdmin || isMod) && (
          <div className="admin-foot" style={{ padding: '0 14px 10px' }}>
            <span style={{ padding: '4px 10px', borderRadius: 10, background: isAdmin ? '#FF6A0A' : '#0B6EE5', color: '#fff', fontSize: 12, fontWeight: 800 }}>{isAdmin ? 'Админ' : 'Модератор'}</span>
          </div>
        )}
        {nav.map(([href, label]) => {
          const active = href === '/admin' ? path === '/admin' : path.startsWith(href);
          return (
            <Link key={href} href={href} className="btn" aria-current={active ? 'page' : undefined}
              style={{ minHeight: 48, borderRadius: 14, padding: '0 14px', display: 'flex', alignItems: 'center', fontWeight: 800, fontSize: 14, background: active ? '#FF6A0A' : 'transparent', color: '#fff', textDecoration: 'none' }}>{label}</Link>
          );
        })}
        <div className="admin-foot" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 12 }}>
          <Link href="/kitchen" className="btn" style={{ minHeight: 40, borderRadius: 12, padding: '0 14px', display: 'flex', alignItems: 'center', fontWeight: 700, fontSize: 13, color: '#B9AFA3', textDecoration: 'none' }}>Кухня →</Link>
          <Link href="/" className="btn" style={{ minHeight: 40, borderRadius: 12, padding: '0 14px', display: 'flex', alignItems: 'center', fontWeight: 700, fontSize: 13, color: '#B9AFA3', textDecoration: 'none' }}>Сайт для клиентов →</Link>
          <button className="btn" onClick={async () => { await signOut(); router.replace('/'); }} style={{ minHeight: 40, borderRadius: 12, padding: '0 14px', textAlign: 'left', fontWeight: 700, fontSize: 13, color: '#FF8A8A' }}>Выйти</button>
          <div style={{ fontSize: 11, color: '#8A7F73', fontWeight: 600, lineHeight: 1.4, padding: '8px 14px 0' }}>Данные: Supabase (PostgreSQL, Auth, Realtime).</div>
        </div>
      </nav>
      <main className="admin-main">{body}</main>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ textAlign: 'center', padding: '80px 20px' }}>{children}</div>;
}
