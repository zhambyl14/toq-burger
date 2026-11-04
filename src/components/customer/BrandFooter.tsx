'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useLang } from '@/i18n/LangProvider';
import type { Branch } from '@/types/catalog';
import '@/styles/home.css';

/**
 * Brand footer from the owner's artwork (/brand/footer.jpg: orange field, white notch, TOK burger wordmark).
 * The image is multiplied over the cream page so its white wedge blends in; the orange below matches
 * the image's orange after that blend so the seam is invisible.
 * Desktop: the same artwork + orange body become a centered badge (like the CHAMPION header) with bolt accents.
 */
export function BrandFooter({ branches }: { branches: Pick<Branch, 'id' | 'short_name'>[] }) {
  const { t } = useLang();
  return (
    <footer className="bf-wrap">
      <div className="bf-badge">
        <Image src="/brand/footer.jpg" alt="TOK burger" width={628} height={299} unoptimized sizes="(max-width: 899px) 100vw, 820px" className="bf-art" />
        <div className="bf-body">
          <span aria-hidden="true" className="hm-bolt bf-bolt bf-bolt--a" />
          <span aria-hidden="true" className="hm-bolt bf-bolt bf-bolt--b" />
          <div className="bf-halal">100% ХАЛАЛ</div>
          <div className="bf-info">
            {branches.length ? branches.map((b) => b.short_name).join(' · ') : 'Самал-3 · Радостовца · Жарокова · Толе би'}
            <br />{t('Ежедневно 00:00–24:00 · перерыв 06:00–08:00', 'Күн сайын 00:00–24:00 · үзіліс 06:00–08:00')}
          </div>
          <div className="bf-links">
            <Link href="/branches" className="btn bf-link bf-link--white">{t('Адреса и карта', 'Мекенжайлар және карта')}</Link>
            <a href="https://www.instagram.com/tokburger_official" target="_blank" rel="noopener noreferrer" className="btn bf-link bf-link--glass">Instagram</a>
          </div>
          <div className="bf-copy">© TOK BURGER · {t('Алматы', 'Алматы')}</div>
        </div>
      </div>
    </footer>
  );
}
