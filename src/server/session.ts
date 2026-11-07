import 'server-only';
import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { internalEmailFor } from '@/lib/phone';

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


/** Ensures user + profile for a verified phone and mints a one-time magic-link token hash (null on failure). */
export async function mintSession(db: SupabaseClient, phone: string): Promise<string | null> {
  const email = internalEmailFor(phone);
  const userId = await ensureUser(db, phone, email);
  if (!userId) return null;

  // safety net: profile/roles exist even if the trigger did not run
  const { data: prof } = await db.from('profiles').select('id').eq('id', userId).maybeSingle();
  if (!prof) {
    const ins = await db.from('profiles').insert({ id: userId, phone });
    if (ins.error) return null;
    await db.from('user_roles').insert({ user_id: userId, role: 'CUSTOMER' });
    await db.from('loyalty_accounts').insert({ user_id: userId });
    await db.rpc('apply_staff_invites', { p_user: userId, p_phone: phone });
  }

  const link = await db.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash || link.data.user?.id !== userId) return null;

  return tokenHash;
}

/** Staff (any role except CUSTOMER, or a pending staff invite) must always use a real WhatsApp code. */
export async function isStaffPhone(db: SupabaseClient, phone: string): Promise<boolean> {
  const { data: inv } = await db.from('staff_invites').select('id').eq('phone', phone).limit(1);
  if (inv?.length) return true;
  const { data: prof } = await db.from('profiles').select('id').eq('phone', phone).maybeSingle();
  if (!prof) return false;
  const { data: roles } = await db.from('user_roles').select('role').eq('user_id', prof.id).neq('role', 'CUSTOMER').limit(1);
  return !!roles?.length;
}

/** Admin "test mode" switch (payment_settings.test_mode). Fails closed. */
export async function loginTestModeOn(db: SupabaseClient): Promise<boolean> {
  const { data, error } = await db.from('payment_settings').select('test_mode').eq('id', 1).maybeSingle();
  return !error && data?.test_mode === true;
}
