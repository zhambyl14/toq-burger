import { NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeKzPhone } from '@/lib/phone';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { clientIp, generateOtp, hashOtp, OTP_RESEND_SECONDS, OTP_TTL_SECONDS, testCodeFor } from '@/server/otp';
import { isStaffPhone, loginTestModeOn, mintSession } from '@/server/session';
import { whatsapp } from '@/server/whatsapp';

const Body = z.object({ phone: z.string().min(10).max(20) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  const phone = parsed.success ? normalizeKzPhone(parsed.data.phone) : null;
  if (!phone) return NextResponse.json({ error: 'INVALID_PHONE' }, { status: 400 });

  let db;
  try {
    db = supabaseAdmin();
  } catch {
    return NextResponse.json({ error: 'SERVER_NOT_CONFIGURED' }, { status: 503 });
  }

  // Admin test mode: customers log in with the phone alone. Staff phones are excluded, they always need a real code.
  if (await loginTestModeOn(db) && !(await isStaffPhone(db, phone))) {
    const tokenHash = await mintSession(db, phone);
    if (!tokenHash) return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });
    return NextResponse.json({ ok: true, direct: true, tokenHash });
  }

  const testCode = testCodeFor(phone);
  const provider = testCode ? null : whatsapp();
  if (!testCode && !provider) return NextResponse.json({ error: 'WHATSAPP_UNAVAILABLE' }, { status: 503 });

  const code = testCode ?? generateOtp();
  const { data: status, error } = await db.rpc('otp_issue', {
    p_phone: phone, p_hash: hashOtp(phone, code), p_ip: clientIp(req.headers), p_ttl_seconds: OTP_TTL_SECONDS,
    p_skip_limits: !!testCode, // owner-approved test numbers only
  });
  if (error) return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });
  if (status === 'COOLDOWN') return NextResponse.json({ error: 'COOLDOWN', retryAfter: OTP_RESEND_SECONDS }, { status: 429 });
  if (status === 'RATE_LIMITED') return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  if (provider) {
    try {
      await provider.sendOtp(phone, code);
    } catch {
      await db.rpc('otp_cancel_latest', { p_phone: phone });
      return NextResponse.json({ error: 'WHATSAPP_SEND_FAILED' }, { status: 502 });
    }
  }

  return NextResponse.json({
    ok: true,
    resendIn: OTP_RESEND_SECONDS,
    expiresIn: OTP_TTL_SECONDS,
    channel: testCode ? 'test' : provider!.mode === 'bot' ? 'whatsapp' : 'dev-mock',
    // development only: lets you log in without a WhatsApp bot. Never in production.
    devCode: provider?.mode === 'dev-mock' ? code : undefined,
  });
}
