import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeKzPhone } from '@/lib/phone';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { hashOtp } from '@/server/otp';
import { mintSession } from '@/server/session';

const Body = z.object({ phone: z.string().min(10).max(20), code: z.string().regex(/^\d{6}$/) });

/**
 * Verifies the WhatsApp code atomically, ensures exactly one Supabase user per phone, then mints a
 * one-time magic-link token_hash (no email is sent; the internal domain is undeliverable by design).
 * The client exchanges it with supabase.auth.verifyOtp() for a genuine Supabase session.
 * Works the same for web and Flutter clients.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  const phone = parsed.success ? normalizeKzPhone(parsed.data.phone) : null;
  if (!parsed.success || !phone) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });

  let db: SupabaseClient;
  try {
    db = supabaseAdmin();
  } catch {
    return NextResponse.json({ error: 'SERVER_NOT_CONFIGURED' }, { status: 503 });
  }

  const { data: result, error } = await db.rpc('otp_verify', { p_phone: phone, p_hash: hashOtp(phone, parsed.data.code) });
  if (error) return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });
  if (result !== 'OK') {
    return NextResponse.json({ error: result }, { status: result === 'INVALID' ? 401 : 410 }); // INVALID | EXPIRED | LOCKED | NOT_FOUND
  }

  const tokenHash = await mintSession(db, phone);
  if (!tokenHash) return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });
  return NextResponse.json({ ok: true, tokenHash });
}
