'use client';
import { useLang } from './LangProvider';
import type { Lang } from './lang';

const OPTIONS: { id: Lang; label: string; full: string }[] = [
  { id: 'kk', label: 'ҚАЗ', full: 'Қазақша' },
  { id: 'ru', label: 'РУС', full: 'Русский' },
];

/** ҚАЗ | РУС pill. variant: 'light' for light/colored backgrounds, 'dark' for dark staff UIs, 'onOrange' for orange headers. */
export function LangSwitch({ variant = 'light', style }: { variant?: 'light' | 'dark' | 'onOrange'; style?: React.CSSProperties }) {
  const { lang, setLang } = useLang();
  const pal = variant === 'dark'
    ? { bg: '#241F1B', on: '#FF6A0A', onFg: '#fff', off: '#B9AFA3' }
    : variant === 'onOrange'
      ? { bg: 'rgba(255,255,255,.22)', on: '#fff', onFg: '#C24D00', off: '#fff' }
      : { bg: '#F3EADF', on: '#FF6A0A', onFg: '#fff', off: '#6B6258' };
  return (
    <div role="group" aria-label="Язык / Тіл" style={{ display: 'inline-flex', padding: 3, borderRadius: 16, background: pal.bg, ...style }}>
      {OPTIONS.map((o) => {
        const active = lang === o.id;
        return (
          <button key={o.id} type="button" aria-pressed={active} aria-label={o.full} onClick={() => setLang(o.id)}
            style={{ minWidth: 44, minHeight: 32, padding: '0 10px', borderRadius: 13, fontSize: 12, fontWeight: 800, letterSpacing: '.04em', background: active ? pal.on : 'transparent', color: active ? pal.onFg : pal.off, transition: 'background .15s' }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
