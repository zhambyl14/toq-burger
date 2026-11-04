'use client';
import { useLang } from '@/i18n/LangProvider';
import { fmtNumber } from '@/lib/money';

const ORANGE = '#F96000';

/**
 * Price tag in the restaurant's Instagram style: black block with the two-line bilingual meat label
 * ("тауық еті / курица"), a lightning-shaped cut, and an orange block with the heavy white price.
 * Props: kk/ru = label lines (pass the variant label in both languages; for single-variant products pass the
 * unit like "100 г"), price = integer KZT or null (renders the "price clarified" pill without the orange block).
 * size 'md' (list cards) | 'lg' (product page). Pure presentational, no interactivity.
 */
export function PricePill({ kk, ru, price, size = 'md', selected = false, prefix = '', className }: {
  kk: string; ru: string; price: number | null; size?: 'md' | 'lg'; selected?: boolean; prefix?: string; className?: string;
}) {
  const { t } = useLang();
  const h = size === 'lg' ? 56 : 44;
  const label = size === 'lg' ? 14 : 11.5;
  const num = size === 'lg' ? 26 : 19;
  const same = kk.trim().toLowerCase() === ru.trim().toLowerCase();
  return (
    <span role="text" className={className} aria-label={`${same ? ru : `${kk} / ${ru}`}: ${price == null ? t('цена уточняется', 'бағасы нақтылануда') : fmtNumber(price) + t(' тенге', ' теңге')}`}
      style={{ display: 'inline-flex', alignItems: 'stretch', height: h, borderRadius: size === 'lg' ? 18 : 14, overflow: 'hidden', background: '#141210', boxShadow: selected ? `0 0 0 3px ${ORANGE}` : '0 4px 12px rgba(20,18,16,.18)', maxWidth: '100%' }}>
      <span style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: size === 'lg' ? '0 22px 0 16px' : '0 18px 0 12px', color: '#fff', fontWeight: 800, fontSize: label, lineHeight: 1.08, whiteSpace: 'nowrap' }}>
        {same ? <span>{ru}</span> : <><span>{kk}</span><span>{ru}</span></>}
      </span>
      {price == null ? (
        <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', background: '#6B6258', color: '#fff', fontWeight: 800, fontSize: label, marginLeft: -8, clipPath: 'polygon(30% 0,100% 0,100% 100%,0 100%,24% 52%,8% 52%)', paddingLeft: 24 }}>
          {t('уточняется', 'нақтылануда')}
        </span>
      ) : (
        // wrapper carries the white slit (drop-shadow is applied before the child's clip-path)
        <span aria-hidden="true" style={{ display: 'flex', filter: 'drop-shadow(-2px 0 0 #fff)', marginLeft: size === 'lg' ? -16 : -12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, background: ORANGE, color: '#fff', paddingLeft: size === 'lg' ? 34 : 26, paddingRight: size === 'lg' ? 16 : 12, clipPath: 'polygon(30% 0,100% 0,100% 100%,0 100%,24% 52%,8% 52%)' }}>
            {prefix && <span style={{ fontSize: label, fontWeight: 700, opacity: 0.9 }}>{prefix}</span>}
            <span className="disp" style={{ fontWeight: 800, fontSize: num, letterSpacing: '-.02em', whiteSpace: 'nowrap' }}>{fmtNumber(price)}</span>
            <span style={{ fontSize: size === 'lg' ? 15 : 12, fontWeight: 800, opacity: 0.95 }}>₸</span>
          </span>
        </span>
      )}
    </span>
  );
}
