-- Admin switch: while on, customers (never staff) can sign in with just a phone number, no WhatsApp code.
alter table public.payment_settings add column test_mode boolean not null default false;
