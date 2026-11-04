# TOK BURGER — Architecture

## Stack
- **Next.js 16 (App Router, TypeScript strict)** — customer site `src/app/(customer)`, staff apps `src/app/{kitchen,courier,admin}`, API routes `src/app/api`.
- **Supabase** — Postgres, Auth, Realtime, Storage. Project ref `lriekmwkbrllwixdlbux`.
- **Leaflet + OpenStreetMap** maps; geocoding through a cached, throttled proxy `/api/geocode` (Nominatim).
- **Zustand** (persisted cart/address/favorites), **Zod** for API input validation.
- **WhatsApp bot** `whatsapp-bot/` (whatsapp-web.js) — separate long-running service that only delivers OTP texts.

## Security model
- All business writes go through **security-definer Postgres functions**; tables are read-only to clients via RLS:
  - `place_order` — server-side pricing from DB, branch auto-assignment, promo, idempotency key, advisory lock per user.
  - `transition_order` — validated lifecycle (`order_transition_allowed`), role checks (branch staff / assigned courier / customer cancel PENDING / admin), timestamps; trigger writes `order_status_history` + `notifications`.
  - `courier_accept_order` — conditional UPDATE (`courier_id is null`) + unique partial index → one winner.
  - `report_courier_location` — courier only, active delivery only, 1 point / 5 s.
  - `admin_*` — `is_admin()` checked inside.
- Roles live in `user_roles` (never from the client). Staff are pre-authorized by phone in `staff_invites`; applied on first login.
- `whatsapp_otp_verifications` and `audit_logs` have no client grants.
- Customer sees courier GPS only while its own order is `PICKED_UP`/`ON_THE_WAY` (RLS).

## WhatsApp OTP login (web + future Flutter)
1. `POST /api/auth/otp/request {phone}` → normalize `+7XXXXXXXXXX`, `otp_issue` (60 s cooldown, 5/h per phone, 20/h per IP, previous codes invalidated), HMAC-SHA256 hash stored, WhatsApp bot sends the code. If sending fails the code is deleted and the client gets an error.
2. `POST /api/auth/otp/verify {phone, code}` → `otp_verify` (row lock, 5 attempts, 5 min TTL, one-time) → create/get Supabase user `8XXXXXXXXXX@wa.tokburger.invalid` (reserved, undeliverable TLD — nobody can receive login mail for it) (`app_metadata.phone`) → `generateLink(magiclink)` (no email is sent) → returns `tokenHash`.
3. Client: `supabase.auth.verifyOtp({ token_hash, type: 'email' })` → genuine Supabase session.
Test numbers (env `TEST_OTP_PHONES` + `TEST_OTP_CODE`) skip WhatsApp but use the same table, limits and session.

## Branch assignment
`find_delivery_branch(lat, lon, at)`: active + accepting + **verified coordinates** + open at `at` (Asia/Almaty hours, break 06:00–08:00) + inside `delivery_radius_km` → nearest. The UI previews the same logic (`src/features/branches/assign.ts`); the DB decides.

## Money
Integer KZT everywhere (`*_kzt integer`), `total = subtotal - discount + delivery_fee` enforced by a CHECK.

## Courier auto-dispatch (migration 14)
- Couriers never pick orders. When a DELIVERY order enters `PREPARING`, trigger → `dispatch_order()` assigns an **online** courier with no active orders (nearest by fresh GPS to the branch, else idle the longest) so they reach the branch while the kitchen finishes. Waiting orders are retried when a courier goes online or finishes (`dispatch_pending`).
- **Batching**: a courier still heading to / waiting at a branch also receives further orders of the SAME branch when ready times differ ≤ `ready_window_min` AND drop points are ≤ `max_drop_distance_km` apart OR in the same direction (≤ `max_bearing_diff_deg`), up to `max_batch_size`. All thresholds: table `dispatch_settings` (admin UI /admin/dispatch).
- A courier with active orders cannot go offline (trigger `HAS_ACTIVE_ORDERS`). Pick-up is allowed only from `READY`.
- Admin and moderator can see the courier of every order and change it (`reassign_courier`, `release_courier`). Every action is stored with the actor's name and role in `order_status_history` (events STATUS / COURIER_ASSIGNED / COURIER_RELEASED / SUPPORT_REPLY / NOTE).

## Roles
ADMIN (everything), MODERATOR (orders + support, reassign couriers; no catalog/staff), KITCHEN/OPERATOR (own branch), COURIER (own deliveries + support), CUSTOMER. Staff exist only if an admin invites their phone (`staff_invites`); admins can change a staff phone (`admin_change_staff_phone`).
