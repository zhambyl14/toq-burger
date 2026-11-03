// End-to-end smoke test against a running server + the real Supabase project.
// Usage: BASE=http://localhost:3100 node --env-file=.env.local tests/e2e/smoke.mjs
// Uses the owner-approved test numbers (TEST_OTP_PHONES / TEST_OTP_CODE). Cleans up the order it creates.
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.BASE || 'http://localhost:3000';
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const CODE = process.env.TEST_OTP_CODE;
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : extra); };
const post = async (path, body) => { const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };

async function login(phone, { wrongFirst = false } = {}) {
  const req = await post('/api/auth/otp/request', { phone });
  if (req.status === 429 && req.body.error === 'COOLDOWN') { /* previous code still valid */ } else ok(`otp request ${phone}`, req.status === 200 && req.body.channel === 'test', JSON.stringify(req));
  if (wrongFirst) {
    const bad = await post('/api/auth/otp/verify', { phone, code: CODE === '000000' ? '111111' : '000000' });
    ok('wrong code rejected', bad.status === 401 && bad.body.error === 'INVALID', JSON.stringify(bad));
  }
  const v = await post('/api/auth/otp/verify', { phone, code: CODE });
  ok(`otp verify ${phone}`, v.status === 200 && !!v.body.tokenHash, JSON.stringify(v));
  const reuse = await post('/api/auth/otp/verify', { phone, code: CODE });
  ok('reused code rejected', reuse.status !== 200, JSON.stringify(reuse));
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.verifyOtp({ token_hash: v.body.tokenHash, type: 'email' });
  ok(`supabase session ${phone}`, !error && !!data.session, error?.message);
  return c;
}

const home = await fetch(BASE + '/');
const html = await home.text();
ok('home 200 + menu rendered', home.status === 200 && html.includes('ТВОЙ ГОЛОД') && html.includes('DOUBLE CHEESE'));
for (const p of ['/menu', '/cart', '/branches', '/auth', '/product/mustard', '/kitchen', '/courier', '/admin']) {
  const r = await fetch(BASE + p);
  ok(`GET ${p} ${r.status}`, r.status === 200);
}
const bad = await post('/api/auth/otp/request', { phone: '+7 123' });
ok('invalid phone rejected', bad.status === 400);

const admin = await login('+77474005347', { wrongFirst: true });
const { data: aroles } = await admin.rpc('my_roles');
ok('admin roles', aroles?.includes('ADMIN') && aroles?.includes('CUSTOMER'), JSON.stringify(aroles));

const kitchen = await login('+77474005348');
const { data: kroles } = await kitchen.rpc('my_roles');
ok('kitchen roles', kroles?.includes('KITCHEN') && kroles?.includes('OPERATOR'), JSON.stringify(kroles));

const courier = await login('+77474005350');
const { data: croles } = await courier.rpc('my_roles');
ok('courier role', croles?.includes('COURIER'), JSON.stringify(croles));

// order as the admin's customer identity (pickup: does not depend on coordinate verification)
const { data: prods } = await admin.from('products').select('id,slug');
const classic = prods.find((p) => p.slug === 'classic').id;
const { data: ex } = await admin.from('product_extras').select('id,slug');
const sauce = ex.find((e) => e.slug === 'cheese-sauce').id;
const { data: br } = await admin.from('branches').select('id,slug');
const zhar = br.find((b) => b.slug === 'zhar').id;
const key = 'e2e-' + Date.now();
const args = { p_idempotency_key: key, p_mode: 'PICKUP', p_items: [{ product_id: classic, meat: 'beef', quantity: 1, extra_ids: [sauce] }], p_payment: 'CASH', p_contact_phone: '+77474005347', p_branch_id: zhar, p_note: 'E2E тест — удалить' };
const { data: orderId, error: oerr } = await admin.rpc('place_order', args);
ok('place order', !oerr && !!orderId, oerr?.message);
const { data: again } = await admin.rpc('place_order', args);
ok('duplicate submit returns same order', again === orderId);
const { data: o } = await admin.from('orders').select('total_kzt,status').eq('id', orderId).single();
ok('server total 2290+200=2490', o?.total_kzt === 2490, JSON.stringify(o));

const { error: ce } = await courier.rpc('transition_order', { p_order: orderId, p_to: 'ACCEPTED' });
ok('courier cannot accept kitchen order', !!ce);
for (const to of ['ACCEPTED', 'PREPARING', 'READY', 'DELIVERED']) {
  const { error } = await kitchen.rpc('transition_order', { p_order: orderId, p_to: to });
  ok(`kitchen → ${to}`, !error, error?.message);
}
const { data: hist } = await admin.from('order_status_history').select('to_status').eq('order_id', orderId);
ok('status history recorded (5)', hist?.length === 5, JSON.stringify(hist));
const { count } = await courier.from('orders').select('id', { count: 'exact', head: true }).eq('id', orderId);
ok('courier cannot see unrelated order', count === 0);

// cleanup with service role
const svc = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { error: de } = await svc.from('orders').delete().eq('id', orderId);
ok('cleanup', !de, de?.message);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
