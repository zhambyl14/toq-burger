import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { internalEmailFor, normalizeKzPhone } from '@/lib/phone';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { hashOtp } from '@/server/otp';

const Body = z.object({ phone: z.string().min(10).max(20), code: z.string().regex(/^\d{6}$/) });

const randomPassword = () => randomBytes(32).toString('base64url');

/**
 * Returns the auth user id that owns this phone, creating it if needed.
 * Trust anchor = public.profiles.phone (written only by our trigger from app_metadata, which only the
 * service role can set). An auth user that has the internal email but no profile was NOT created by us
 * (e.g. a public sign-up attempt) and is deleted before creating the real account.
 */
async function ensureUser(db: SupabaseClient, phone: string, email: string): Promise<string | null> {
  const { data: prof } = await db.from('profiles').select('id').eq('phone', phone).maybeSingle();
  if (prof?.id) {
    const { data: u } = await db.auth.admin.getUserById(prof.id);
    if (u.user && (u.user.email !== email || u.user.app_metadata?.phone !== phone)) {
      const upd = await db.auth.admin.updateUserById(prof.id, { email, email_confirm: true, app_metadata: { phone } });
      if (upd.error) return null;
    }
    return prof.id;
  }

  const create = () => db.auth.admin.createUser({ email, email_confirm: true, password: randomPassword(), app_metadata: { phone } });
  let created = await create();
  if (created.error) {
    // email taken by an untrusted account without profile => remove it, then create the real one
    const link = await db.auth.admin.generateLink({ type: 'magiclink', email });
    const squatter = link.data?.user;
    if (!squatter) return null;
    const { data: p2 } = await db.from('profiles').select('id').eq('id', squatter.id).maybeSingle();
    if (p2) return squatter.id; // race: profile created concurrently
    const del = await db.auth.admin.deleteUser(squatter.id);
    if (del.error) return null;
    created = await create();
    if (created.error) return null;
  }
  return created.data.user?.id ?? null;
}

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

  const email = internalEmailFor(phone);
  const userId = await ensureUser(db, phone, email);
  if (!userId) return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });

  // safety net: profile/roles exist even if the trigger did not run
  const { data: prof } = await db.from('profiles').select('id').eq('id', userId).maybeSingle();
  if (!prof) {
    const ins = await db.from('profiles').insert({ id: userId, phone });
    if (ins.error) return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });
    await db.from('user_roles').insert({ user_id: userId, role: 'CUSTOMER' });
    await db.from('loyalty_accounts').insert({ user_id: userId });
    await db.rpc('apply_staff_invites', { p_user: userId, p_phone: phone });
  }

  const link = await db.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash || link.data.user?.id !== userId) return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });

  return NextResponse.json({ ok: true, tokenHash });
}
