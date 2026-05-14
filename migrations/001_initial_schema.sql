create extension if not exists pgcrypto;

create table if not exists prizes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('DIGITAL_COUPON', 'BOOTH_COUPON', 'ETC')),
  image_url text,
  total_quantity integer not null default 0 check (total_quantity >= 0),
  remaining_quantity integer not null default 0 check (remaining_quantity >= 0),
  probability_weight integer not null default 1 check (probability_weight > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint prizes_remaining_not_over_total check (remaining_quantity <= total_quantity)
);

create table if not exists lucky_draw_entries (
  id uuid primary key default gen_random_uuid(),
  session_id text,
  payment_method text not null default 'BANK_TRANSFER' check (payment_method in ('BANK_TRANSFER')),
  amount integer not null default 990 check (amount > 0),
  depositor_name text,
  result text not null check (result in ('WIN', 'LOSE')),
  prize_id uuid references prizes(id),
  status text not null default 'RESULT_CONFIRMED' check (status in ('RESULT_CONFIRMED')),
  payment_verified boolean not null default false,
  created_at timestamptz not null default now(),
  constraint lucky_draw_result_prize_consistency check (
    (result = 'WIN' and prize_id is not null)
    or (result = 'LOSE' and prize_id is null)
  )
);

create index if not exists idx_lucky_draw_entries_session_created
  on lucky_draw_entries(session_id, created_at desc);

create table if not exists winner_infos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null unique references lucky_draw_entries(id) on delete cascade,
  name text not null,
  phone text not null,
  review text not null,
  delivery_status text not null default 'PENDING' check (delivery_status in ('PENDING', 'SENT')),
  created_at timestamptz not null default now(),
  constraint winner_infos_name_length check (char_length(btrim(name)) between 1 and 20),
  constraint winner_infos_phone_normalized check (phone ~ '^010[0-9]{8}$'),
  constraint winner_infos_review_length check (char_length(btrim(review)) between 1 and 100)
);

create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  prize_id uuid references prizes(id),
  assigned_entry_id uuid unique references lucky_draw_entries(id),
  title text not null,
  coupon_image_url text,
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE', 'ASSIGNED', 'USED', 'EXPIRED')),
  event_name text,
  booth_name text,
  menu_name text,
  valid_from date,
  valid_until date,
  contact_phone text,
  assigned_at timestamptz,
  used_at timestamptz,
  signature_image_url text,
  created_at timestamptz not null default now(),
  constraint coupons_assignment_consistency check (
    (status = 'ASSIGNED' and assigned_entry_id is not null and assigned_at is not null)
    or (status <> 'ASSIGNED')
  ),
  constraint coupons_used_consistency check (
    (status = 'USED' and used_at is not null and signature_image_url is not null)
    or (status <> 'USED')
  )
);

create index if not exists idx_coupons_prize_status
  on coupons(prize_id, status, created_at);

create table if not exists coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null unique references coupons(id) on delete cascade,
  signature_image_url text not null,
  redeemed_at timestamptz not null default now()
);

create table if not exists sheet_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  target_tab text not null,
  operation text not null check (operation in ('APPEND', 'UPSERT', 'UPDATE')),
  dedupe_key text,
  payload jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sheet_sync_jobs_status_created
  on sheet_sync_jobs(status, created_at);

create unique index if not exists idx_sheet_sync_jobs_dedupe_key
  on sheet_sync_jobs(dedupe_key)
  where dedupe_key is not null;
