-- Clients, brands, platform accounts, people and their roles.

create table users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text not null,
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null unique,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table brands (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients (id),
  name        text not null,
  code        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (client_id, code)
);
create index brands_client_idx on brands (client_id);

-- A role is either global (brand_id null) or scoped to one brand. The same
-- person can hold different roles on different brands.
create table user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users (id) on delete cascade,
  role        user_role not null,
  brand_id    uuid references brands (id),
  created_at  timestamptz not null default now(),
  unique nulls not distinct (user_id, role, brand_id)
);
create index user_roles_user_idx on user_roles (user_id);
create index user_roles_brand_idx on user_roles (brand_id);

create table platform_accounts (
  id                     uuid primary key default gen_random_uuid(),
  brand_id               uuid not null references brands (id),
  platform               platform_code not null default 'TIKTOK_SHOP',
  account_name           text not null,
  external_shop_id       text,
  timezone               text not null default 'Asia/Ho_Chi_Minh',
  -- Real refunds settle ~15 days later, so NMV is estimated from this rate.
  estimated_refund_rate  numeric(6, 4) not null default 0,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint refund_rate_range check (estimated_refund_rate >= 0 and estimated_refund_rate < 1)
);
create index platform_accounts_brand_idx on platform_accounts (brand_id);

-- Thresholds live here rather than in code: how long after a shift data is
-- still "on time", how long a gap breaks a room's continuity, and so on.
create table system_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid references users (id),
  updated_at  timestamptz not null default now()
);

insert into system_settings (key, value, description) values
  ('data_submission_grace_minutes', '30',
   'Số phút sau khi ca kết thúc mà dữ liệu vẫn được tính là nộp đúng hạn'),
  ('room_continuity_max_gap_hours', '8',
   'Khoảng trống tối đa để coi cùng một Room ID là tiếp nối, vượt ngưỡng thì cần Operation xác nhận'),
  ('segment_match_min_overlap_minutes', '2',
   'Thời gian giao nhau tối thiểu giữa đoạn live và ca để coi là khớp'),
  ('segment_match_min_overlap_ratio', '0.1',
   'Tỷ lệ giao nhau tối thiểu so với độ dài đoạn live');
