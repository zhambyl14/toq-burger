import { NextResponse } from 'next/server';
import { z } from 'zod';
import { internalEmailFor, normalizeKzPhone } from '@/lib/phone';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { hashOtp } from '@/server/otp';

const Body = z.object({ phone: z.string().min(10).max(20), code: z.string().regex(/^\d{6}$/) });

/**
 * Verifies the WhatsApp code atomically, ensures exactly one Supabase user per phone
 * (deterministic internal email + unique profiles.phone), then mints a one-time magic-link
 * token_hash (no email is sent). The client exchanges it with supabase.auth.verifyOtp()
 * to obtain a genuine Supabase session. Works the same for web and Flutter clients.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  const phone = parsed.success ? normalizeKzPhone(parsed.data.phone) : null;
  if (!parsed.success || !phone) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });

  let db;
  try {
    db = supabaseAdmin();
  } catch {
    return NextResponse.json({ error: 'SERVER_NOT_CONFIGURED' }, { status: 503 });
  }

  const { data: result, error } = await db.rpc('otp_verify', { p_phone: phone, p_hash: hashOtp(phone, parsed.data.code) });
  if (error) return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });
  if (result !== 'OK') {
    const status = result === 'INVALID' ? 401 : 410;
    return NextResponse.json({ error: result }, { status }); // INVALID | EXPIRED | LOCKED | NOT_FOUND
  }

  const email = internalEmailFor(phone);
  const created = await db.auth.admin.createUser({ email, email_confirm: true, app_metadata: { phone } });
  if (created.error && created.error.code !== 'email_exists' && created.error.status !== 422) {
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });
  }

  const link = await db.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });

  // existing user created before the profile trigger => make sure profile/roles exist
  const userId = link.data.user?.id;
  if (userId) {
    const { data: prof } = await db.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (!prof) {
      await db.auth.admin.updateUserById(userId, { app_metadata: { phone } });
      await db.from('profiles').insert({ id: userId, phone });
      await db.from('user_roles').insert({ user_id: userId, role: 'CUSTOMER' });
      await db.from('loyalty_accounts').insert({ user_id: userId });
      await db.rpc('apply_staff_invites', { p_user: userId, p_phone: phone });
    }
  }

  return NextResponse.json({ ok: true, tokenHash });
}
