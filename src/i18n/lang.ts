// Shared (server + client) language helpers. No React here so server components can import it.
export type Lang = 'ru' | 'kk';
export const LANG_COOKIE = 'tb_lang';
export const LANGS: Lang[] = ['ru', 'kk'];

export function parseLang(v: string | null | undefined): Lang | null {
  return v === 'kk' || v === 'ru' ? v : null;
}

/** First visit: Kazakh if the browser prefers it, otherwise Russian (the default). */
export function detectLang(acceptLanguage: string | null | undefined): Lang {
  const first = (acceptLanguage ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
  return first.startsWith('kk') ? 'kk' : 'ru';
}

export const LOCALE: Record<Lang, string> = { ru: 'ru-RU', kk: 'kk-KZ' };

/** Pick the Kazakh text when language is kk and a non-empty Kazakh value exists; otherwise Russian. */
export function pickText(lang: Lang, ru: string | null | undefined, kk: string | null | undefined): string {
  if (lang === 'kk' && kk && kk.trim()) return kk;
  return ru ?? '';
}
export function pickList(lang: Lang, ru: string[], kk: string[] | null | undefined): string[] {
  return lang === 'kk' && kk && kk.length ? kk : ru;
}
