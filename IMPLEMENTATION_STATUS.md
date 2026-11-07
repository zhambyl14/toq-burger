# Implementation status (2026-11-03)

## Done and verified
- DB: 26 entities + staff_invites, audit_logs, OTP table; RLS; atomic functions (place_order, transition_order, courier_accept_order, release_courier, report_courier_location, OTP issue/verify). 88 PGlite tests + live E2E (43 checks) pass.
- Customer site (approved design): home, menu+search+categories, product (meat/extras/qty), cart (meat switch, promo preview, note), checkout (delivery/pickup, address details, branch, ASAP/scheduled, payment, contact), Leaflet/OSM address picker with geolocation + search + reverse geocoding, branches map, realtime tracking with courier GPS, profile (bonus balance, name, addresses, history+reorder, favorites synced, notifications toggle, support), WhatsApp OTP login with fixed +7 prefix.
- Moderator role, support threads (customers + couriers, order attach), named action history, product photo editor, automatic courier dispatch with batching (see ARCHITECTURE.md).
- Kitchen/operator dashboard (realtime, sound + mute, columns, actions, stop-list), courier app (offers, atomic accept, active delivery, navigation, GPS, history), admin (dashboard stats, orders with filters/pagination/actions, products/prices/photos/availability, branches/zones/hours, staff invites, couriers, promotions, customers, support, audit log).
- TypeScript strict 0 errors, ESLint 0 problems, production build OK.
- Verified on the Cloudflare Workers runtime locally (OpenNext build + wrangler dev): E2E 43/43. Note: `cacheComponents` must stay OFF — it hangs on Workers.

## Requires the owner
- **Branch coordinates**: taken from the approved design, stored as *unverified*. Delivery auto-assignment is disabled until an admin ticks «Координаты проверены» for each branch (Admin → Филиалы). Pickup works now.
- **Product photos**: upload in Admin → Меню (the design's photos are not downloadable from the design tool).
- **WhatsApp bot**: run `whatsapp-bot` on an always-on machine/VPS, scan the QR with a dedicated WhatsApp Business number, set `WHATSAPP_BOT_URL`/`WHATSAPP_BOT_TOKEN`. Until then only the test numbers can log in.
- **Drink prices, delivery fees, radius, promo codes**: set in the admin panel (no invented values).
- **Payments** (migration 19): admin-managed in Admin → Оплата. Cash and/or Kaspi (QR image, pay link, transfer phone, instructions kk/ru, payment timeout). Kaspi orders wait in `AWAITING_RECEIPT` → customer uploads a receipt (private `receipts` bucket) → `REVIEW` → admin/moderator confirms/rejects. Kitchen only sees an online order once it is payable (cash or confirmed); unpaid orders auto-cancel after the timeout; cancelled paid orders land in a «нужен возврат» list. No card acquiring yet (`ONLINE` is refused by the DB).
- **Kitchen**: online and offline (walk-in) orders are separate tabs; kitchen can create offline orders (paid at the till) but can NOT cancel — it files a cancel request, admin/moderator approves or dismisses (Admin → Заказы, red counter in the sidebar).
- **Admin**: create/delete branches (new branch starts closed to orders), payments review queue, source filter, cancel-request resolution.
- **Push notifications (FCM)**: notification rows are written per status change; delivery to devices needs FCM credentials.
