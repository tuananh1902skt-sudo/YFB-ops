-- Imported platform data. Everything here is a record of what the platform
-- said, and stays exactly as received: corrections are made downstream.

create table import_mappings (
  id                uuid primary key default gen_random_uuid(),
  import_type       import_type not null,
  header_signature  text not null,
  header_columns    jsonb not null,
  mapping           jsonb not null,
  version           integer not null default 1,
  created_by        uuid references users (id),
  created_at        timestamptz not null default now(),
  unique (import_type, header_signature)
);

create table raw_imports (
  id                   uuid primary key default gen_random_uuid(),
  import_type          import_type not null,
  platform_account_id  uuid not null references platform_accounts (id),
  file_name            text not null,
  file_hash            text not null,
  storage_path         text not null,
  mapping_id           uuid references import_mappings (id),
  data_period_start    date,
  data_period_end      date,
  row_count            integer,
  status               import_status not null default 'UPLOADED',
  error_summary        jsonb,
  uploaded_by          uuid not null references users (id),
  uploaded_at          timestamptz not null default now()
);
create index raw_imports_account_idx on raw_imports (platform_account_id, uploaded_at desc);
create index raw_imports_hash_idx on raw_imports (file_hash);

-- Original cell values, verbatim, as strings. Insert-only by policy: this is
-- what every computed figure is traced back to.
create table raw_import_rows (
  id           bigserial primary key,
  import_id    uuid not null references raw_imports (id) on delete cascade,
  row_index    integer not null,
  raw_values   jsonb not null,
  parse_error  text,
  created_at   timestamptz not null default now(),
  unique (import_id, row_index)
);

-- Room IDs are 19 digits: stored as text because JavaScript numbers cannot
-- hold them exactly and would corrupt them in transit.
create table platform_rooms (
  id                   uuid primary key default gen_random_uuid(),
  platform_account_id  uuid not null references platform_accounts (id),
  platform_room_id     text not null,
  room_start_at        timestamptz not null,
  room_title           text,
  created_at           timestamptz not null default now(),
  unique (platform_account_id, platform_room_id, room_start_at),
  constraint platform_room_id_digits check (platform_room_id ~ '^\d+$')
);
create index platform_rooms_account_start_idx on platform_rooms (platform_account_id, room_start_at);

-- One row per report download. Figures are cumulative from the room's start,
-- so a shift's own result is the difference between consecutive snapshots.
create table room_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  room_id              uuid not null references platform_rooms (id),
  raw_import_row_id    bigint not null references raw_import_rows (id),
  snapshot_end_at      timestamptz not null,
  duration_minutes     integer,

  gmv                  numeric(18, 2),
  items_sold           integer,
  orders               integer,
  sku_orders           integer,
  customers            integer,
  views                integer,
  impressions          integer,
  product_impressions  integer,
  product_clicks       integer,
  new_followers        integer,
  comments             integer,
  shares               integer,
  likes                integer,

  -- Rates and averages exactly as TikTok reported them. Kept for
  -- reconciliation against a whole room; never differenced across snapshots.
  reported_derived     jsonb,

  created_at           timestamptz not null default now(),
  unique (room_id, snapshot_end_at)
);
create index room_snapshots_room_idx on room_snapshots (room_id, snapshot_end_at);

-- Ads figures are daily and shop-wide: they cover video and product card
-- traffic, hours with no live at all, and the brand's own in-house streams.
-- They are deliberately kept in their own table, never joined onto a shift.
create table ads_daily (
  id                   uuid primary key default gen_random_uuid(),
  platform_account_id  uuid not null references platform_accounts (id),
  stat_date            date not null,
  ads_spend            numeric(18, 2) not null,
  ads_sku_orders       integer,
  ads_gross_revenue    numeric(18, 2),
  currency             text not null default 'VND',
  import_id            uuid references raw_imports (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (platform_account_id, stat_date)
);
