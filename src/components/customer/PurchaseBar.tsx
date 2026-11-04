'use client';
import '@/styles/product.css';
import { useLang } from '@/i18n/LangProvider';
import { fmtNumber } from '@/lib/money';
import { BoltMark } from './BoltMark';
import { PriceTag } from './PriceTag';

const MAX_QTY = 50;

/**
 * Purchase block: [line total with bolt | « − 1 + » pill] over a full-width orange «В корзину».
 * Mobile: fixed bottom bar (.sticky-bar). Desktop: the same markup sits in the info column in flow, as an orange-outlined card.
 * `total` is unit price × qty (null => the price is not set yet, nothing can be bought).
 * After adding, `added` switches the block to the success state (continue / go to cart).
 * `editing` (cart line edit mode): the main button reads «Сохранить изменения · total» and `onAdd` saves the line.
 */
export function PurchaseBar({
  total, qty, onQty, onAdd, added, onContinue, onCart, editing = false,
}: {
  total: number | null;
  qty: number;
  onQty: (n: number) => void;
  onAdd: () => void;
  added: { n: number; name: string } | null;
  onContinue: () => void;
  onCart: () => void;
  editing?: boolean;
}) {
  const { t } = useLang();

  if (added) {
    return (
      <div className="sticky-bar pd-bar pd-bar--added" role="status">
        <span className="pd-bar-bolt" aria-hidden="true"><BoltMark size={52} /></span>
        <div className="pd-done">
          <span className="ring-pop pd-done-ok">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path className="check-path" d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          </span>
          <div className="pd-done-text">{t('Добавлено в корзину', 'Себетке қосылды')}: {added.name} × {added.n}</div>
        </div>
        <div className="pd-done-btns">
          <button type="button" className="btn pd-continue" onClick={onContinue}>{t('Продолжить', 'Жалғастыру')}</button>
          <button type="button" className="btn primary" onClick={onCart}>{t('В корзину', 'Себетке өту')}</button>
        </div>
      </div>
    );
  }

  const unavailable = total == null;
  return (
    <div className="sticky-bar pd-bar">
      <span className="pd-bar-bolt" aria-hidden="true"><BoltMark size={52} /></span>
      <div className="pd-bar-top">
        <div className="pd-bar-sum">
          {!unavailable && <div className="pd-bar-cap">{t('Итого', 'Барлығы')}</div>}
          {unavailable ? (
            <PriceTag amount={null} size={24} color="#141210" />
          ) : (
            <span className="disp pd-total">
              <BoltMark size={24} className="pd-total-bolt" />
              <span>{fmtNumber(total)} ₸</span>
            </span>
          )}
        </div>
        {!unavailable && (
          <div className="pd-step">
            <button type="button" className="btn pd-step-btn" aria-label={t('Меньше', 'Азайту')} onClick={() => onQty(Math.max(1, qty - 1))} disabled={qty <= 1}>−</button>
            <div className="pd-step-n" aria-live="polite">{qty}</div>
            <button type="button" className="btn pd-step-btn" aria-label={t('Больше', 'Көбейту')} onClick={() => onQty(Math.min(MAX_QTY, qty + 1))} disabled={qty >= MAX_QTY}>+</button>
          </div>
        )}
      </div>
      {unavailable ? (
        <button type="button" className="btn pd-soon" disabled>{t('Скоро', 'Жақында')}</button>
      ) : (
        <button type="button" className="btn primary pd-add" onClick={onAdd}>
          {editing ? <>{t('Сохранить изменения', 'Өзгерістерді сақтау')} · {fmtNumber(total)} ₸</> : t('В корзину', 'Себетке қосу')}
        </button>
      )}
    </div>
  );
}
