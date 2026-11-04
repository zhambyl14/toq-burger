'use client';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { LANG_COOKIE, LOCALE, pickList, pickText, type Lang } from './lang';

interface LangCtx {
  lang: Lang;
  locale: string;
  setLang: (l: Lang) => void;
  /** t('Корзина', 'Себет') — inline pair, returns the string for the active language. */
  t: (ru: string, kk: string) => string;
  /** DB content with an optional Kazakh column: tx(product.name, product.nameKk). Falls back to Russian. */
  tx: (ru: string | null | undefined, kk: string | null | undefined) => string;
  txList: (ru: string[], kk: string[] | null | undefined) => string[];
}

const Ctx = createContext<LangCtx>({
  lang: 'ru', locale: LOCALE.ru, setLang: () => {}, t: (ru) => ru, tx: (ru) => ru ?? '', txList: (ru) => ru,
});

export function LangProvider({ initial, children }: { initial: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
  }, []);

  const value = useMemo<LangCtx>(() => ({
    lang,
    locale: LOCALE[lang],
    setLang,
    t: (ru, kk) => (lang === 'kk' ? kk : ru),
    tx: (ru, kk) => pickText(lang, ru, kk),
    txList: (ru, kk) => pickList(lang, ru, kk),
  }), [lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  return useContext(Ctx);
}
