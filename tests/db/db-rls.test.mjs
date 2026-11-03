import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const db = new PGlite();
const stub = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage; create schema extensions;
create table auth.users (id uuid primary key default gen_random_uuid(), raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text);
alter table storage.objects enable row level security;
create publication supabase_realtime;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;
await db.exec(stub);
for (const f of fs.readdirSync(dir).sort()) {
  try { await db.exec(fs.readFileSync(path.join(dir, f), 'utf8')); console.log('OK', f); }
  catch (e) { console.log('FAIL', f, e.message); process.exit(1); }
}

let pass = 0, fail = 0;
const as = async (uid, role, sql, params) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${role};`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
const expect = async (name, fn, check) => {
  try { const r = await fn(); const ok = check(r, null); ok ? pass++ : fail++; console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(r?.rows)); }
  catch (e) { const ok = check(null, e); ok ? pass++ : fail++; console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : e.message); }
};
const err = (code) => (r, e) => !!e && e.message.includes(code);

// users
const mk = async (phone) => (await db.query(`insert into auth.users(raw_app_meta_data) values ($1) returning id`, [{ phone }])).rows[0].id;
const cust = await mk('+77000000001'), cust2 = await mk('+77000000002');
const kitchen = await mk('+77000000010'), courier = await mk('+77000000020'), courier2 = await mk('+77000000021'), admin = await mk('+77000000030');
const zhar = (await db.query(`select id from branches where slug='zhar'`)).rows[0].id;
const tole = (await db.query(`select id from branches where slug='tole'`)).rows[0].id;
await db.query(`insert into user_roles(user_id, role, branch_id) values ($1,'KITCHEN',$2)`, [kitchen, zhar]);
await db.query(`insert into user_roles(user_id, role) values ($1,'COURIER'),($2,'COURIER'),($3,'ADMIN')`, [courier, courier2, admin]);
await db.query(`insert into couriers(user_id, display_name) values ($1,'A'),($2,'B')`, [courier, courier2]);

await expect('profile auto-created with CUSTOMER role', () => db.query(`select role from user_roles where user_id=$1`, [cust]), (r) => r.rows[0]?.role === 'CUSTOMER');

const prod = async (slug, meat) => (await db.query(`select p.id from products p where slug=$1`, [slug])).rows[0].id;
const classic = await prod('classic'), mustard = await prod('mustard'), fanta = await prod('fanta');
const extra = (await db.query(`select id from product_extras where slug='cheese-sauce'`)).rows[0].id;
const place = (uid, key, items, lat = 43.2118, lon = 76.9021, extra = {}) => as(uid, 'authenticated',
  `select place_order($1,'DELIVERY',$2,'CASH','+77474005347', null, $3, $4, 'Тест адрес', null,null,null,null,null,null,$5,$6) as id`,
  [key, JSON.stringify(items), lat, lon, extra.promo ?? null, extra.sched ?? null]);

await expect('Kaskelen (outside Almaty) => OUT_OF_ZONE', () => place(cust, 'key-00000001', [{ product_id: classic, meat: 'beef', quantity: 1 }], 43.2, 76.62), err('OUT_OF_ZONE'));
// coordinates verification no longer gates assignment (owner decision)
// force open regardless of test clock
await db.exec(`delete from branch_working_hours; insert into branch_working_hours(branch_id, day_of_week, open_time, close_time) select b.id, d, '00:00', '00:00' from branches b, generate_series(0,6) d`);

let order;
await expect('place order: server price (2290+200)*2 = 4980', async () => { const r = await place(cust, 'key-00000002', [{ product_id: classic, meat: 'beef', quantity: 2, extra_ids: [extra] }]); order = r.rows[0].id; return db.query(`select subtotal_kzt, total_kzt, branch_id from orders where id=$1`, [order]); },
  (r) => r.rows[0].subtotal_kzt === 4980 && r.rows[0].branch_id === zhar);
await expect('idempotent resubmit returns same order', () => place(cust, 'key-00000002', [{ product_id: classic, meat: 'beef', quantity: 9 }]), (r) => r.rows[0].id === order);
await expect('chicken mustard = 1900', async () => { const r = await place(cust, 'key-00000003', [{ product_id: mustard, meat: 'chicken', quantity: 1 }]); return db.query(`select subtotal_kzt from orders where id=$1`, [r.rows[0].id]); }, (r) => r.rows[0].subtotal_kzt === 1900);
await expect('classic has no chicken variant', () => place(cust, 'key-00000004', [{ product_id: classic, meat: 'chicken', quantity: 1 }]), err('PRODUCT_UNAVAILABLE'));
await expect('drink without price not orderable', () => place(cust, 'key-00000005', [{ product_id: fanta, meat: 'one', quantity: 1 }]), err('PRODUCT_UNAVAILABLE'));
await expect('far address => OUT_OF_ZONE', () => place(cust, 'key-00000006', [{ product_id: classic, meat: 'beef', quantity: 1 }], 43.6, 77.3), err('OUT_OF_ZONE'));
await expect('nearest branch chosen (Tole bi area)', async () => { const r = await place(cust, 'key-00000007', [{ product_id: classic, meat: 'beef', quantity: 1 }], 43.2505, 76.8797); return db.query(`select branch_id from orders where id=$1`, [r.rows[0].id]); }, (r) => r.rows[0].branch_id === tole);
await expect('closed branch not used', async () => { await db.query(`update branches set accepts_orders=false where slug='tole'`); const r = await place(cust, 'key-00000008', [{ product_id: classic, meat: 'beef', quantity: 1 }], 43.2505, 76.8797); await db.query(`update branches set accepts_orders=true`); return db.query(`select branch_id from orders where id=$1`, [r.rows[0].id]); }, (r) => r.rows[0].branch_id !== tole);
await expect('in_service_area: centre in, Talgar out', () => db.query(`select public.in_service_area(43.2389, 76.9455) a, public.in_service_area(43.30, 77.24) b`), (r) => r.rows[0].a === true && r.rows[0].b === false);
await expect('far but inside Almaty (airport) => nearest branch, no radius limit', async () => { const r = await place(cust, 'key-0000000a', [{ product_id: classic, meat: 'beef', quantity: 1 }], 43.3521, 77.0405); return db.query(`select branch_id from orders where id=$1`, [r.rows[0].id]); }, (r) => !!r.rows[0]?.branch_id);
await expect('test numbers skip hourly limit', async () => { for (let i = 0; i < 7; i++) { await db.query(`update whatsapp_otp_verifications set consumed_at = now() where phone_number='+77474005349'`); const r = await as(null, 'service_role', `select otp_issue('+77474005349','h'||${i},null,300,true) r`); if (r.rows[0].r !== 'OK') return r; } return { rows: [{ r: 'OK' }] }; }, (r) => r.rows[0].r === 'OK');
await expect('real numbers still limited', async () => { let last; for (let i = 0; i < 6; i++) { await db.query(`update whatsapp_otp_verifications set consumed_at = now() where phone_number='+77022222222'`); last = await as(null, 'service_role', `select otp_issue('+77022222222','h'||${i},null) r`); } return last; }, (r) => r.rows[0].r === 'RATE_LIMITED');
await expect('bad quantity rejected', () => place(cust, 'key-00000009', [{ product_id: classic, meat: 'beef', quantity: 0 }]), err('BAD_QUANTITY'));
await expect('anon cannot place order', () => as(null, 'anon', `select place_order('key-0000000x','PICKUP','[]','CASH','+77000000000')`), err('permission denied'));

// isolation
await expect('customer2 cannot see customer1 orders', () => as(cust2, 'authenticated', `select count(*)::int n from orders`), (r) => r.rows[0].n === 0);
await expect('customer sees own orders', () => as(cust, 'authenticated', `select count(*)::int n from orders`), (r) => r.rows[0].n >= 3);
await expect('kitchen sees only own branch', () => as(kitchen, 'authenticated', `select count(*)::int n, count(*) filter (where branch_id <> '${zhar}')::int other from orders`), (r) => r.rows[0].n >= 1 && r.rows[0].other === 0);
await expect('customer cannot update order directly', () => as(cust, 'authenticated', `update orders set total_kzt = 1 where id = '${order}'`), (r, e) => (e && e.message.includes('permission')) || r?.affectedRows === 0);
await expect('customer cannot self-assign ADMIN', () => as(cust, 'authenticated', `insert into user_roles(user_id, role) values ('${cust}','ADMIN')`), (r, e) => !!e);
await expect('customer cannot read OTP table', () => as(cust, 'authenticated', `select * from whatsapp_otp_verifications`), err('permission denied'));
await expect('customer cannot change phone', () => as(cust, 'authenticated', `update profiles set phone='+77777777777' where id='${cust}'`), err('permission denied'));

// lifecycle
const tr = (uid, to) => as(uid, 'authenticated', `select transition_order($1,$2)`, [order, to]);
await expect('customer cannot accept', () => tr(cust, 'ACCEPTED'), err('FORBIDDEN'));
await expect('invalid jump PENDING->READY', () => tr(kitchen, 'READY'), err('INVALID_TRANSITION'));
await expect('kitchen accept/prepare/ready', async () => { await tr(kitchen, 'ACCEPTED'); await tr(kitchen, 'PREPARING'); return tr(kitchen, 'READY'); }, (r) => r.rows[0].transition_order === 'READY');
await expect('courier sees offer', () => as(courier, 'authenticated', `select count(*)::int n from courier_available_orders()`), (r) => r.rows[0].n >= 1);
await expect('courier A wins', () => as(courier, 'authenticated', `select courier_accept_order($1) ok`, [order]), (r) => r.rows[0].ok === true);
await expect('courier B loses (no double assignment)', () => as(courier2, 'authenticated', `select courier_accept_order($1) ok`, [order]), (r) => r.rows[0].ok === false);
await expect('courier B cannot see order', () => as(courier2, 'authenticated', `select count(*)::int n from orders where id='${order}'`), (r) => r.rows[0].n === 0);
await expect('customer cannot see courier location before pickup', async () => { await as(courier, 'authenticated', `select report_courier_location(43.21, 76.9)`); return as(cust, 'authenticated', `select count(*)::int n from courier_locations`); }, (r) => r.rows[0].n === 0);
await expect('courier pickup -> on the way -> delivered', async () => { await tr(courier, 'PICKED_UP'); await tr(courier, 'ON_THE_WAY'); return as(cust, 'authenticated', `select count(*)::int n from courier_locations`); }, (r) => r.rows[0].n === 1);
await expect('gps rate-limited (5s)', () => as(courier, 'authenticated', `select report_courier_location(43.22, 76.9) ok`), (r) => r.rows[0].ok === false);
await expect('delivered + history recorded', async () => { await tr(courier, 'DELIVERED'); return db.query(`select count(*)::int n from order_status_history where order_id=$1`, [order]); }, (r) => r.rows[0].n === 8);
await expect('cannot cancel delivered', () => tr(admin, 'CANCELLED'), err('INVALID_TRANSITION'));
await expect('payment not marked paid', () => db.query(`select status from payments where order_id=$1`, [order]), (r) => r.rows[0].status === 'PENDING');

// OTP
const sr = (sql, p) => as(null, 'service_role', sql, p);
await expect('authenticated cannot call otp_issue', () => as(cust, 'authenticated', `select otp_issue('+77011111111','h',null)`), err('permission denied'));
await expect('otp issue OK', () => sr(`select otp_issue('+77011111111','hash1','1.2.3.4') r`), (r) => r.rows[0].r === 'OK');
await expect('otp cooldown', () => sr(`select otp_issue('+77011111111','hash2','1.2.3.4') r`), (r) => r.rows[0].r === 'COOLDOWN');
await expect('otp wrong', () => sr(`select otp_verify('+77011111111','nope') r`), (r) => r.rows[0].r === 'INVALID');
await expect('otp right', () => sr(`select otp_verify('+77011111111','hash1') r`), (r) => r.rows[0].r === 'OK');
await expect('otp reuse rejected', () => sr(`select otp_verify('+77011111111','hash1') r`), (r) => r.rows[0].r === 'NOT_FOUND');
await expect('new code allowed right after successful login', () => sr(`select otp_issue('+77011111111','hashR',null) r`), (r) => r.rows[0].r === 'OK');
await expect('cooldown while unused code is active', () => sr(`select otp_issue('+77011111111','hashR2',null) r`), (r) => r.rows[0].r === 'COOLDOWN');
await expect('otp locks after 5 wrong', async () => { await db.query(`update whatsapp_otp_verifications set created_at = now() - interval '2 minutes'`); await sr(`select otp_issue('+77011111111','hash3',null)`); for (let i = 0; i < 4; i++) await sr(`select otp_verify('+77011111111','x')`); return sr(`select otp_verify('+77011111111','x') r`); }, (r) => r.rows[0].r === 'LOCKED');
await expect('locked code unusable even if right', () => sr(`select otp_verify('+77011111111','hash3') r`), (r) => r.rows[0].r === 'NOT_FOUND');
await expect('otp expired', async () => { await db.query(`update whatsapp_otp_verifications set created_at = now() - interval '2 minutes'`); await sr(`select otp_issue('+77011111111','hash4',null)`); await db.query(`update whatsapp_otp_verifications set expires_at = now() - interval '1 second' where otp_hash='hash4'`); return sr(`select otp_verify('+77011111111','hash4') r`); }, (r) => r.rows[0].r === 'EXPIRED');

// staff invites
const tAdmin = await mk('+77474005347'), tKitchen = await mk('+77474005348'), tCourier = await mk('+77474005350');
await expect('invite: +77474005347 is ADMIN', () => db.query(`select array_agg(role::text) r from user_roles where user_id=$1`, [tAdmin]), (r) => r.rows[0].r.includes('ADMIN') && r.rows[0].r.includes('CUSTOMER'));
await expect('invite: +77474005348 kitchen+operator in 4 branches', () => db.query(`select count(*)::int n from user_roles where user_id=$1 and role in ('KITCHEN','OPERATOR')`, [tKitchen]), (r) => r.rows[0].n === 8);
await expect('invite: +77474005350 courier active', () => db.query(`select is_active from couriers where user_id=$1`, [tCourier]), (r) => r.rows[0]?.is_active === true);
await expect('customer cannot invite staff', () => as(cust, 'authenticated', `select admin_invite_staff('+77000000002','ADMIN')`), err('FORBIDDEN'));
await expect('admin invites existing customer as courier', async () => { await as(tAdmin, 'authenticated', `select admin_invite_staff('+77000000002','COURIER',null,'Вася')`); return db.query(`select count(*)::int n from couriers where user_id=$1`, [cust2]); }, (r) => r.rows[0].n === 1);
await expect('admin stats', () => as(tAdmin, 'authenticated', `select sum(orders_total)::int n from admin_stats(now() - interval '1 day', now() + interval '1 minute')`), (r) => r.rows[0].n >= 3);
await expect('audit log written', () => db.query(`select count(*)::int n from audit_logs where entity='staff_invites'`), (r) => r.rows[0].n >= 1);

// moderation, support threads, named history, phone change
await db.query(`insert into staff_invites(phone, role, display_name) values ('+77000000040','MODERATOR','Модератор Айгерім')`);
const moder = await mk('+77000000040');
await expect('moderator role applied from invite', () => db.query(`select count(*)::int n from user_roles where user_id=$1 and role='MODERATOR'`, [moder]), (r) => r.rows[0].n === 1);
await expect('moderator sees all orders', () => as(moder, 'authenticated', `select count(*)::int n from orders`), (r) => r.rows[0].n >= 3);
let mOrder;
await expect('moderator can change order status', async () => { const r = await place(cust, 'key-mod-0001', [{ product_id: classic, meat: 'beef', quantity: 1 }]); mOrder = r.rows[0].id; return as(moder, 'authenticated', `select transition_order('${mOrder}','ACCEPTED') s`); }, (r) => r.rows[0].s === 'ACCEPTED');
await expect('history has actor name + role', () => db.query(`select actor_name, actor_role from order_status_history where order_id=$1 and to_status='ACCEPTED'`, [mOrder]), (r) => r.rows[0]?.actor_name === 'Модератор Айгерім' && r.rows[0]?.actor_role === 'MODERATOR');
await expect('moderator cannot edit catalog', () => as(moder, 'authenticated', `update products set name='X' where slug='classic'`), (r, e) => !!e || r.affectedRows === 0);
let sreq;
await expect('customer opens support thread on own order', async () => { const r = await as(cust, 'authenticated', `insert into support_requests(user_id, order_id, message, kind) values ('${cust}','${mOrder}','Где заказ?','COURIER') returning id, kind, status`); sreq = r.rows[0].id; return r; }, (r) => r.rows[0].kind === 'CUSTOMER' && r.rows[0].status === 'OPEN');
await expect('customer2 cannot read that thread', () => as(cust2, 'authenticated', `select count(*)::int n from support_requests where id='${sreq}'`), (r) => r.rows[0].n === 0);
await expect('moderator replies; thread IN_PROGRESS + order event', async () => { await as(moder, 'authenticated', `insert into support_messages(request_id, author_id, body) values ('${sreq}','${moder}','Уже едет')`); return db.query(`select (select status from support_requests where id=$1) st, (select count(*)::int from order_status_history where order_id=$2 and event='SUPPORT_REPLY') ev, (select author_role from support_messages where request_id=$1 limit 1) ar`, [sreq, mOrder]); }, (r) => r.rows[0].st === 'IN_PROGRESS' && r.rows[0].ev === 1 && r.rows[0].ar === 'MODERATOR');
await expect('customer sees reply', () => as(cust, 'authenticated', `select count(*)::int n from support_messages where request_id='${sreq}'`), (r) => r.rows[0].n === 1);
await expect('other customer cannot post into the thread', () => as(cust2, 'authenticated', `insert into support_messages(request_id, author_id, body) values ('${sreq}','${cust2}','hack')`), (r, e) => !!e);
await expect('courier support thread kind COURIER', () => as(courier, 'authenticated', `insert into support_requests(user_id, message, kind) values ('${courier}','Клиент не отвечает','COURIER') returning kind`), (r) => r.rows[0].kind === 'COURIER');
await expect('courier reject recorded with role', async () => { await as(courier2, 'authenticated', `select courier_reject_order('${mOrder}')`); return db.query(`select actor_role from order_status_history where order_id=$1 and event='COURIER_REJECTED'`, [mOrder]); }, (r) => r.rows[0]?.actor_role === 'COURIER');
await expect('moderator cannot change staff phone', () => as(moder, 'authenticated', `select admin_change_staff_phone('+77000000040','+77000000041')`), err('FORBIDDEN'));
await expect('admin changes staff phone (invite + profile)', async () => { await as(tAdmin, 'authenticated', `select admin_change_staff_phone('+77000000040','+77000000041')`); return db.query(`select (select phone from profiles where id=$1) p, (select count(*)::int from staff_invites where phone='+77000000041') i`, [moder]); }, (r) => r.rows[0].p === '+77000000041' && r.rows[0].i === 1);
await expect('phone change to taken number refused', () => as(tAdmin, 'authenticated', `select admin_change_staff_phone('+77000000041','+77000000002')`), err('PHONE_TAKEN'));

await expect('halal: no bacon in menu', () => db.query(`select count(*)::int n from products where description ~* 'бекон' or 'Бекон' = any(ingredients)`), (r) => r.rows[0].n === 0);
await expect('customer shares own order into general thread', async () => {
  const t = await as(cust, 'authenticated', `insert into support_requests(user_id, message) values ('${cust}','Вопрос') returning id`);
  await as(cust, 'authenticated', `insert into support_messages(request_id, author_id, body, order_id) values ('${t.rows[0].id}','${cust}','Вот заказ','${mOrder}')`);
  return db.query(`select order_id from support_requests where id=$1`, [t.rows[0].id]);
}, (r) => r.rows[0].order_id === mOrder);
await expect('customer cannot share someone else order', async () => {
  const t = await as(cust2, 'authenticated', `insert into support_requests(user_id, message) values ('${cust2}','Вопрос') returning id`);
  return as(cust2, 'authenticated', `insert into support_messages(request_id, author_id, body, order_id) values ('${t.rows[0].id}','${cust2}','чужой','${mOrder}')`);
}, err('ORDER_NOT_YOURS'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
