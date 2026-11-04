'use client';
import { useLang } from '@/i18n/LangProvider';
import '@/styles/home.css';

/** Certificate chip of the Spiritual Administration of Muslims of Kazakhstan (ҚМДБ / ДУМК). Styled in home.css (.cert-badge). */
export function CertBadge({ className = '' }: { className?: string }) {
  const { t } = useLang();
  return (
    <span className={`cert-badge ${className}`.trim()}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2.8 4.5 5.6v5.8c0 4.6 3.1 8.3 7.5 9.8 4.4-1.5 7.5-5.2 7.5-9.8V5.6L12 2.8Z" />
        <path d="m8.6 12.2 2.4 2.4 4.4-4.8" />
      </svg>
      {t('Сертификат ҚМДБ (ДУМК)', 'ҚМДБ сертификаты')}
    </span>
  );
}
