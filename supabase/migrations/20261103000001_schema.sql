-- TOK BURGER: core schema. Money = integer KZT. Never edit after applying; add a new migration.

create type public.user_role as enum ('CUSTOMER','KITCHEN','OPERATOR','COURIER','ADMIN');
create type public.order_status as enum ('PENDING','ACCEPTED','PREPARING','READY','COURIER_ASSIGNED','PICKED_UP','ON_THE_WAY','DELIVERED','CANCELLED');
create type public.fulfillment_mode as enum ('DELIVERY','PICKUP');
create type public.payment_method as enum ('KASPI_QR','ONLINE','CASH');
create type public.payment_status as enum ('PENDING','PAID','FAILED','REFUNDED');
create type public.meat_type as enum ('chicken','beef','one');
create type public.assignment_status as enum ('OFFERED','ACCEPTED','REJECTED','EXPIRED','CANCELLED','COMPLETED');

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- 1. profiles -------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text not null unique check (phone ~ '^\+7[0-9]{10}$'),
  full_name text,
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_upd before update on public.profiles for each row execute function public.set_updated_at();

-- 3. branches (before user_roles: roles reference branch) -------------------
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_name text not null,
  address text not null,
  map_url text,
  lat double precision,
  lon double precision,
  coords_verified boolean not null default false,
  delivery_radius_km numeric(5,2) not null default 8 check (delivery_radius_km > 0),
  delivery_fee_kzt integer not null default 0 check (delivery_fee_kzt >= 0),
  min_order_kzt integer not null default 0 check (min_order_kzt >= 0),
  is_active boolean not null default true,
  accepts_orders boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lat is null) = (lon is null))
);
create trigger trg_branches_upd before update on public.branches for each row execute function public.set_updated_at();

-- 2. user_roles -------------------------------------------------------------
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.user_role not null,
  branch_id uuid references public.branches(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique nulls not distinct (user_id, role, branch_id),
  check (role not in ('KITCHEN','OPERATOR') or branch_id is not null)
);
create index on public.user_roles(user_id);
create index on public.user_roles(role);

-- Staff pre-authorized by phone; applied automatically on first login (see handle_new_user).
create table public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (phone ~ '^\+7[0-9]{10}$'),
  role public.user_role not null check (role <> 'CUSTOMER'),
  branch_id uuid references public.branches(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  unique nulls not distinct (phone, role, branch_id)
);

-- 4. branch_working_hours (day 0=Mon..6=Sun; two windows via rows) -----------
create table public.branch_working_hours (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  open_time time not null,
  close_time time not null,
  unique (branch_id, day_of_week, open_time)
);
-- Break window (06:00-08:00) is stored as two opening windows around it.

-- 6. categories / 5. products ---------------------------------------------
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table public.product_extra_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  max_select smallint
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category_id uuid not null references public.product_categories(id),
  name text not null,
  tagline text,
  description text,
  ingredients text[] not null default '{}',
  image_path text,
  extra_group_id uuid references public.product_extra_groups(id) on delete set null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.products(category_id, sort_order);
create trigger trg_products_upd before update on public.products for each row execute function public.set_updated_at();

-- 7. variants: price null => shown but not orderable ("price clarified")
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  meat public.meat_type not null,
  label text not null,
  price_kzt integer check (price_kzt is null or price_kzt >= 0),
  nutrition text,
  image_path text,
  is_active boolean not null default true,
  unique (product_id, meat)
);

-- 8. extras
create table public.product_extras (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.product_extra_groups(id) on delete cascade,
  slug text not null unique,
  name text not null,
  price_kzt integer not null check (price_kzt >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0
);

-- 10. availability per branch (absence of a row = available)
create table public.product_availability (
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  is_available boolean not null default true,
  primary key (branch_id, product_id)
);

-- 11. addresses
create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text,
  address_text text not null,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  apartment text, entrance text, floor text, intercom text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.customer_addresses(user_id);

-- 12-13. carts (server-persisted cart for signed-in users)
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now()
);
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id),
  meat public.meat_type not null,
  quantity integer not null check (quantity between 1 and 50),
  extra_ids uuid[] not null default '{}',
  unique (cart_id, product_id, meat, extra_ids)
);

-- 21. promotions (before orders)
create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  percent_off smallint check (percent_off between 1 and 100),
  amount_off_kzt integer check (amount_off_kzt > 0),
  min_subtotal_kzt integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses integer,
  used_count integer not null default 0,
  is_active boolean not null default true,
  check ((percent_off is not null) <> (amount_off_kzt is not null))
);

-- 18. couriers
create table public.couriers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null,
  is_active boolean not null default true,
  is_online boolean not null default false,
  created_at timestamptz not null default now()
);

-- 14-15. orders
create sequence public.order_number_seq start 1001;
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no integer not null unique default nextval('public.order_number_seq'),
  user_id uuid not null references public.profiles(id),
  branch_id uuid not null references public.branches(id),
  status public.order_status not null default 'PENDING',
  mode public.fulfillment_mode not null,
  idempotency_key text not null,
  contact_phone text not null,
  customer_name text,
  address_text text,
  lat double precision, lon double precision,
  apartment text, entrance text, floor text, intercom text,
  courier_instructions text,
  note text,
  scheduled_for timestamptz,
  subtotal_kzt integer not null check (subtotal_kzt >= 0),
  discount_kzt integer not null default 0 check (discount_kzt >= 0),
  delivery_fee_kzt integer not null default 0 check (delivery_fee_kzt >= 0),
  total_kzt integer not null check (total_kzt >= 0),
  promo_code text,
  payment_method public.payment_method not null,
  courier_id uuid references public.couriers(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz, preparing_at timestamptz, ready_at timestamptz,
  picked_up_at timestamptz, delivered_at timestamptz, cancelled_at timestamptz,
  unique (user_id, idempotency_key),
  check (total_kzt = subtotal_kzt - discount_kzt + delivery_fee_kzt),
  check (mode = 'PICKUP' or (address_text is not null and lat is not null and lon is not null))
);
create index on public.orders(branch_id, status, created_at desc);
create index on public.orders(user_id, created_at desc);
create index on public.orders(courier_id) where courier_id is not null;
create trigger trg_orders_upd before update on public.orders for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  meat public.meat_type not null,
  quantity integer not null check (quantity > 0),
  unit_price_kzt integer not null check (unit_price_kzt >= 0),
  extras jsonb not null default '[]',
  line_total_kzt integer not null check (line_total_kzt >= 0)
);
create index on public.order_items(order_id);

-- 16. status history
create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index on public.order_status_history(order_id, created_at);

-- 17. payments
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method public.payment_method not null,
  status public.payment_status not null default 'PENDING',
  amount_kzt integer not null check (amount_kzt >= 0),
  provider text not null default 'none',
  provider_ref text,
  is_demo boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.payments(order_id);

-- 19-20. courier GPS + assignments
create table public.courier_locations (
  id bigint generated always as identity primary key,
  courier_id uuid not null references public.couriers(user_id) on delete cascade,
  lat double precision not null, lon double precision not null,
  created_at timestamptz not null default now()
);
create index on public.courier_locations(courier_id, created_at desc);

create table public.courier_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  courier_id uuid not null references public.couriers(user_id),
  status public.assignment_status not null default 'OFFERED',
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 minutes',
  responded_at timestamptz
);
-- one live (offered/accepted) assignment per order => no double-assignment
create unique index uq_assignment_live on public.courier_assignments(order_id) where status in ('ACCEPTED');
create index on public.courier_assignments(courier_id, status);
create index on public.courier_assignments(order_id);

-- 22-26.
create table public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create table public.loyalty_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0)
);
create table public.loyalty_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id),
  delta integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event text not null,
  title text not null,
  body text,
  order_id uuid references public.orders(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications(user_id, created_at desc);
create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id),
  message text not null check (length(message) between 1 and 2000),
  status text not null default 'OPEN',
  created_at timestamptz not null default now()
);

-- admin audit log
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

-- WhatsApp OTP (never exposed through the API) ---------------------------------
create table public.whatsapp_otp_verifications (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null check (phone_number ~ '^\+7[0-9]{10}$'),
  otp_hash text not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0,
  max_attempts smallint not null default 5,
  verified_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  request_ip inet
);
create index on public.whatsapp_otp_verifications(phone_number, created_at desc);
create index on public.whatsapp_otp_verifications(request_ip, created_at desc);
