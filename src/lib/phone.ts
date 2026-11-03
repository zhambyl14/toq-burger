// Kazakhstan phone helpers. Canonical form: +7XXXXXXXXXX (E.164).

/** Accepts "+7 747 400 53 47", "87474005347", "7474005347", "77474005347". Returns null if invalid. */
export function normalizeKzPhone(input: string): string | null {
  const d = input.replace(/\D/g, '');
  let ten: string | null = null;
  if (d.length === 10) ten = d;
  else if (d.length === 11 && (d[0] === '7' || d[0] === '8')) ten = d.slice(1);
  if (!ten || !/^7\d{9}$/.test(ten)) return null; // KZ mobile numbers start with 7 (e.g. 700, 701, 747, 777)
  return '+7' + ten;
}

/** Deterministic internal Supabase identity. Never shown to the customer. */
export function internalEmailFor(e164: string): string {
  const domain = process.env.AUTH_INTERNAL_EMAIL_DOMAIN || 'mail.ru';
  return `8${e164.slice(2)}@${domain}`;
}

/** "7474005347" -> "747 400 53 47" */
export function formatTenDigits(ten: string): string {
  const d = ten.replace(/\D/g, '').slice(0, 10);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean);
  return parts.join(' ');
}

export function formatPhone(e164: string): string {
  return '+7 ' + formatTenDigits(e164.slice(2));
}

/** +7 747 *** ** 47 */
export function maskPhone(e164: string): string {
  const t = e164.slice(2);
  return `+7 ${t.slice(0, 3)} *** ** ${t.slice(8, 10)}`;
}
