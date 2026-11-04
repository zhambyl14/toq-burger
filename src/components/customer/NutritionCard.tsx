'use client';
import '@/styles/product.css';
import { useLang } from '@/i18n/LangProvider';
import { BoltMark } from './BoltMark';
import type { Nutrition } from '@/features/catalog/nutrition';

/**
 * Nutrition card in the restaurant's Instagram style: rounded orange outline, big bolt over the top-left corner,
 * orange bilingual labels (kk/ru — the brand always writes both) and heavy black numbers in a 2x2 grid.
 * Missing values are simply not shown (nothing is invented). Layout lives in product.css (.nc-*).
 */
export function NutritionCard({ n }: { n: Nutrition }) {
  const { t } = useLang();
  const cells: { label: string; value: number | null }[] = [
    { label: 'ккал', value: n.kcal },
    { label: 'ақуыз/белок', value: n.protein },
    { label: 'май/жиры', value: n.fat },
    { label: 'көмірсу/углевод', value: n.carbs },
  ];
  return (
    <div role="group" aria-label={t('Пищевая ценность', 'Тағамдық құндылығы')} className="nc-card">
      <BoltMark size={64} rotate={-6} className="nc-bolt" />
      <div className="nc-body">
        {cells.map((c) => (
          <div key={c.label} style={{ minWidth: 0 }}>
            <div className="nc-label">{c.label}</div>
            <div className="disp nc-val">{c.value ?? '—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
