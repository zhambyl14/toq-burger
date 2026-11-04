export interface Nutrition {
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
}

/**
 * Parses the stored nutrition line, Russian "Б 41 · Ж 62 · У 53 · 934 ккал" or Kazakh "А 41 · М 62 · Ұ 53 · 934 ккал".
 * Returns null when nothing recognisable is inside (the card is then not shown — nothing is invented).
 */
export function parseNutrition(text: string | null | undefined): Nutrition | null {
  if (!text) return null;
  const num = (m: RegExpExecArray | null) => (m ? Number(m[1].replace(',', '.')) : null);
  const protein = num(/(?:^|[\s·,;])[БА]\s*(\d+(?:[.,]\d+)?)/.exec(text));
  const fat = num(/(?:^|[\s·,;])[ЖМ]\s*(\d+(?:[.,]\d+)?)/.exec(text));
  const carbs = num(/(?:^|[\s·,;])[УҰ]\s*(\d+(?:[.,]\d+)?)/.exec(text));
  const kcal = num(/(\d+(?:[.,]\d+)?)\s*ккал/i.exec(text));
  if (protein == null && fat == null && carbs == null && kcal == null) return null;
  return { kcal, protein, fat, carbs };
}
