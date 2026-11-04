'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui';
import { useSession, type Role } from '@/hooks/useSession';
import { useLang } from '@/i18n/LangProvider';

/** Client-side UX guard. Real enforcement is RLS + security-definer functions in the database. */
export function StaffGuard({ roles, next, dark, children }: { roles: Role[]; next: string; dark?: boolean; children: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const { t } = useLang();

  useEffect(() => {
    if (session.ready && !session.user) router.replace(`/auth?next=${encodeURIComponent(next)}`);
  }, [session.ready, session.user, next, router]);

  const bg = dark ? '#141210' : '#F3EADF';
  const fg = dark ? '#fff' : '#141210';

  if (!session.ready || !session.user) {
    return (
      <div style={{ minHeight: '100dvh', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner dark={!dark} />
      </div>
    );
  }

  if (!session.roles.some((r) => roles.includes(r))) {
    return (
      <div style={{ minHeight: '100dvh', background: bg, color: fg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
        <div className="disp" style={{ fontSize: 22, fontWeight: 800 }}>{t('Нет доступа', 'Рұқсат жоқ')}</div>
        <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.75, marginTop: 10, maxWidth: 320, lineHeight: 1.4 }}>
          {t('Этот раздел доступен только сотрудникам. Доступ выдаёт администратор TOK BURGER по номеру телефона.', 'Бұл бөлім тек қызметкерлерге арналған. Қолжетімділікті TOK BURGER әкімшісі телефон нөмірі бойынша береді.')}
        </div>
        <Link href="/" className="btn primary" style={{ marginTop: 20, height: 52, padding: '0 28px', borderRadius: 26, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>{t('На главную', 'Басты бетке')}</Link>
      </div>
    );
  }

  return <>{children}</>;
}
