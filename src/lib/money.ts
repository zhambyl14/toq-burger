/** Integer KZT -> "2 290" (thin grouping with regular spaces) */
export function fmtNumber(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Integer KZT -> "2 290 ₸" */
export function fmt(n: number): string {
  return fmtNumber(n) + ' ₸';
}
