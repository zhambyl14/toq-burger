/** TOK BURGER is 100% halal: defensively drop any pork wording that may still sit in old catalog rows. */
const PORK = /бекон|свинин|ветчин/i;

export function cleanText(s: string | null | undefined): string | null {
  if (!s) return null;
  const out = s.replace(/\s*(бекон|свинин|ветчин)\p{L}*\s*,?/giu, ' ').replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',').trim();
  return out || null;
}

export function cleanList(list: string[]): string[] {
  return list.filter((i) => !PORK.test(i));
}
