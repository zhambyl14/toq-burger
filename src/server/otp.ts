import 'server-only';
import { createHmac, randomInt } from 'node:crypto';

export const OTP_TTL_SECONDS = 300;
export const OTP_RESEND_SECONDS = 60;

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** HMAC-SHA256(phone:code) with a server secret: plaintext codes are never stored. */
export function hashOtp(phone: string, code: string): string {
  const secret = process.env.OTP_HASH_SECRET;
  if (!secret || secret.length < 16) throw new Error('OTP_HASH_SECRET_MISSING');
  return createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
}

/**
 * Owner-approved test numbers (TEST_OTP_PHONES, comma separated) use the fixed TEST_OTP_CODE
 * and skip WhatsApp. They still go through the same OTP table, limits and real Supabase session.
 * Remove the env vars to disable.
 */
export function testCodeFor(phone: string): string | null {
  const code = process.env.TEST_OTP_CODE;
  const list = (process.env.TEST_OTP_PHONES || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!code || !/^\d{6}$/.test(code) || !list.includes(phone)) return null;
  return code;
}

export function clientIp(headers: Headers): string | null {
  const xf = headers.get('x-forwarded-for');
  const ip = (xf ? xf.split(',')[0] : headers.get('x-real-ip'))?.trim();
  if (!ip) return null;
  return /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null;
}
