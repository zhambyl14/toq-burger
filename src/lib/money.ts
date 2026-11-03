/** Integer KZT -> "2 290 ₸" */
export function fmt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₸';
}
