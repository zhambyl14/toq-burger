// E2E for automatic courier dispatch against the real Supabase project (through the live/ local site for OTP login).
// Usage: BASE=https://toq-burger.tarazblt12005.workers.dev node --env-file=.env.local tests/e2e/dispatch.mjs
// Uses the owner-approved test numbers; creates two orders and deletes them afterwards.
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.BASE || 'http://localhost:3000';
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const CODE = process.env.TEST_OTP_CODE;
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else fail++; console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : extra); };
const post = async (path, body) => { const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };

async function login(phone) {
  await post('/api/auth/otp/request', { phone });
  const v = await post('/api/auth/otp/verify', { phone, code: CODE });
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.verifyOtp({ token_hash: v.body.tokenHash, type: 'email' });
  if (error) throw new Error('login failed ' + phone + ': ' + error.message);
  return { c, id: data.user.id };
}

const customer = await login('+77474005349');
const kitchen = await login('+77474005348');
const courier = await login('+77474005350');
const admin = await login('+77474005347');
const svc = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: prods } = await customer.c.from('products').select('id,slug');
const classic = prods.find((p) => p.slug === 'classic').id;
const orders = [];
let sched = null; // set to a time after 08:00 when the branches are in their 06:00–08:00 break
const place = async (key, lat, lon) => {
  const { data, error } = await customer.c.rpc('place_order', {
    p_idempotency_key: key + Date.now(), p_mode: 'DELIVERY', p_items: [{ product_id: classic, meat: 'beef', quantity: 1, extra_ids: [] }],
    p_payment: 'CASH', p_contact_phone: '+77474005349', p_lat: lat, p_lon: lon, p_address: 'E2E тест, Алматы', p_note: 'E2E dispatch — удалить', p_scheduled_for: sched,
  });
  if (data) orders.push(data);
  return { data, error };
};
const tr = (who, id, to) => who.c.rpc('transition_order', { p_order: id, p_to: to });
const courierOf = async (id) => (await svc.from('orders').select('courier_id').eq('id', id).single()).data.courier_id;

try {
  // courier online (self-service flag), nobody else is online in this project
  await svc.from('couriers').update({ is_online: false }).neq('user_id', courier.id);
  const on = await courier.c.from('couriers').update({ is_online: true }).eq('user_id', courier.id);
  ok('courier goes online', !on.error, on.error?.message);

  let first = await place('e2e-disp-1-', 43.2125, 76.9021);
  if (first.error && /OUT_OF_ZONE|BRANCH_UNAVAILABLE/.test(first.error.message)) {
    sched = new Date(Date.now() + 3 * 3600e3).toISOString(); // branches are on their break: schedule for later
    console.log('note: branches closed now, using a scheduled order');
    first = await place('e2e-disp-1-', 43.2125, 76.9021);
  }
  ok('customer places delivery order', !first.error && !!first.data, first.error?.message);
  const o1 = first.data;

  ok('no courier yet while PENDING', (await courierOf(o1)) === null);
  ok('kitchen accepts', !(await tr(kitchen, o1, 'ACCEPTED')).error);
  ok('still no courier on ACCEPTED', (await courierOf(o1)) === null);
  ok('kitchen starts preparing', !(await tr(kitchen, o1, 'PREPARING')).error);
  ok('courier auto-assigned at PREPARING', (await courierOf(o1)) === courier.id);

  const seen = await courier.c.from('orders').select('id,status').eq('id', o1).maybeSingle();
  ok('courier sees the order while it is being prepared', seen.data?.status === 'PREPARING', JSON.stringify(seen));
  const early = await tr(courier, o1, 'PICKED_UP');
  ok('courier cannot pick up before READY', !!early.error && /INVALID_TRANSITION/.test(early.error.message), early.error?.message);
  const off = await courier.c.from('couriers').update({ is_online: false }).eq('user_id', courier.id);
  ok('courier cannot go offline with an active order', !!off.error && /HAS_ACTIVE_ORDERS/.test(off.error.message), off.error?.message);
  const self = await courier.c.rpc('courier_accept_order', { p_order: o1 });
  ok('self-accept RPC is closed', !!self.error);

  // second order from the same branch, same area, right away => same courier (batch)
  const second = await place('e2e-disp-2-', 43.2128, 76.9026);
  ok('second order placed', !second.error && !!second.data, second.error?.message);
  await tr(kitchen, second.data, 'ACCEPTED');
  await tr(kitchen, second.data, 'PREPARING');
  ok('second nearby order batched onto the same courier', (await courierOf(second.data)) === courier.id);

  ok('kitchen marks first READY', !(await tr(kitchen, o1, 'READY')).error);
  ok('courier picks up from READY', !(await tr(courier, o1, 'PICKED_UP')).error);
  ok('courier on the way', !(await tr(courier, o1, 'ON_THE_WAY')).error);
  ok('courier delivers', !(await tr(courier, o1, 'DELIVERED')).error);

  // admin reassign (second order has no other courier online => manual to the same id is allowed; auto => may stay null)
  const re = await admin.c.rpc('reassign_courier', { p_order: second.data, p_courier: courier.id });
  ok('admin can reassign a courier', !re.error, re.error?.message);
  const hist = await admin.c.from('order_status_history').select('actor_name,actor_role,event,note').eq('order_id', second.data).order('id');
  ok('history has named actors (kitchen + admin + system)', hist.data?.some((h) => h.actor_role === 'ADMIN') && hist.data?.some((h) => h.actor_role === 'SYSTEM') && hist.data?.every((h) => !!h.actor_name), JSON.stringify(hist.data));
  const customerHist = await customer.c.from('order_status_history').select('id').eq('order_id', second.data);
  ok('customer can still read own order history', !customerHist.error);
} finally {
  for (const id of orders) await svc.from('orders').delete().eq('id', id);
  await svc.from('couriers').update({ is_online: false }).eq('user_id', courier.id);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
