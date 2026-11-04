'use client';
import Image from 'next/image';
import { useLang } from '@/i18n/LangProvider';
import { fmt } from '@/lib/money';

/**
 * Price with the brand lightning bolt next to it.
 * tone 'orange' = gradient bolt (catalog prices), 'ink' = black bolt (totals, dark-on-light summaries).
 * A null amount renders the "price clarified" text without an icon (nothing is invented).
 */
export function PriceTag({
  amount, prefix = '', tone = 'orange', size = 15, color, weight = 800, style,
}: {
  amount: number | null;
  prefix?: string; // e.g. "от "
  tone?: 'orange' | 'ink';
  size?: number; // font size in px; icon scales with it
  color?: string;
  weight?: number;
  style?: React.CSSProperties;
}) {
  const { t } = useLang();
  if (amount == null) {
    return <span style={{ fontSize: Math.max(11, size - 2), fontWeight: 700, color: '#6B6258', ...style }}>{t('Цена уточняется', 'Бағасы нақтылануда')}</span>;
  }
  const icon = Math.round(size * 1.05);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.max(3, Math.round(size * 0.28)), fontSize: size, fontWeight: weight, color, whiteSpace: 'nowrap', lineHeight: 1.1, ...style }}>
      <Image src={tone === 'ink' ? '/brand/bolt-ink.png' : '/brand/bolt-orange.png'} alt="" width={icon} height={icon} unoptimized aria-hidden="true" style={{ display: 'block', flex: 'none' }} />
      <span>{prefix === 'от ' ? t('от ', 'бастап ') : prefix}{fmt(amount)}</span>
    </span>
  );
}

/** Same as PriceTag but takes the already formatted text of priceFrom() ("от 1 900 ₸" / "Цена уточняется"). */
export function PriceText({ text, tone = 'orange', size = 15, color, style }: { text: string; tone?: 'orange' | 'ink'; size?: number; color?: string; style?: React.CSSProperties }) {
  const { t, lang } = useLang();
  if (!/\d/.test(text)) return <span style={{ fontSize: Math.max(11, size - 2), fontWeight: 700, color: '#6B6258', ...style }}>{text === 'Цена уточняется' ? t('Цена уточняется', 'Бағасы нақтылануда') : text}</span>;
  const shown = lang === 'kk' && text.startsWith('от ') ? `бастап ${text.slice(3)}` : text;
  const icon = Math.round(size * 1.05);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.max(3, Math.round(size * 0.28)), fontSize: size, fontWeight: 800, color, whiteSpace: 'nowrap', lineHeight: 1.1, ...style }}>
      <Image src={tone === 'ink' ? '/brand/bolt-ink.png' : '/brand/bolt-orange.png'} alt="" width={icon} height={icon} unoptimized aria-hidden="true" style={{ display: 'block', flex: 'none' }} />
      <span>{shown}</span>
    </span>
  );
}
