// Security regression: an attacker pre-registers the internal email of a phone with a password before
// the real customer logs in. After the real WhatsApp login the attacker's password must NOT work.
// Usage (dev server, WhatsApp dev-mock returns the code): BASE=http://localhost:3000 node --env-file=.env.local tests/e2e/squat.mjs
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.BASE || 'http://localhost:3000';
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const phone = '+77000000099';
const email = `8${phone.slice(2)}@${process.env.AUTH_INTERNAL_EMAIL_DOMAIN || 'wa.tokburger.invalid'}`;
const pwd = 'Attacker-Passw0rd!';
let fail = 0;
const ok = (n, c, x = '') => { if (!c) fail++; console.log(c ? 'PASS' : 'FAIL', n, c ? '' : x); };
const post = async (p, b) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; };
const svc = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const attacker = createClient(URL_, ANON, { auth: { persistSession: false } });
const su = await attacker.auth.signUp({ email, password: pwd });
console.log('attacker signUp:', su.error?.message ?? 'created (unconfirmed)');

const req = await post('/api/auth/otp/request', { phone });
ok('otp request (dev-mock)', req.status === 200 && /^\d{6}$/.test(req.body.devCode ?? ''), JSON.stringify(req));
const v = await post('/api/auth/otp/verify', { phone, code: req.body.devCode });
ok('verify', v.status === 200 && !!v.body.tokenHash, JSON.stringify(v));
const victim = createClient(URL_, ANON, { auth: { persistSession: false } });
const s = await victim.auth.verifyOtp({ token_hash: v.body.tokenHash, type: 'email' });
ok('victim session', !s.error && !!s.data.session, s.error?.message);
const { data: prof } = await victim.from('profiles').select('phone').maybeSingle();
ok('victim profile phone', prof?.phone === phone, JSON.stringify(prof));

const steal = await attacker.auth.signInWithPassword({ email, password: pwd });
ok('attacker password rejected', !!steal.error && !steal.data.session, 'attacker logged in!');

if (s.data?.user) await svc.auth.admin.deleteUser(s.data.user.id);
if (su.data?.user && su.data.user.id !== s.data?.user?.id) await svc.auth.admin.deleteUser(su.data.user.id).catch(() => {});
console.log(fail ? `\n${fail} failed` : '\nall passed');
process.exit(fail ? 1 : 0);
