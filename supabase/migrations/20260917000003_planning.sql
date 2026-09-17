-- Campaigns, shifts (live_sessions) and the booking flow around them.

create table campaign_types (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

insert into campaign_types (code, name) values
  ('DAILY', 'Live hàng ngày'),
  ('CAMPAIGN', 'Campaign'),
  ('PAYDAY', 'Payday'),
  ('MEGA_CAMPAIGN', 'Mega campaign'),
  ('BRAND_DAY', 'Brand day'),
  ('FLASH_SALE', 'Flash sale'),
  ('OTHER', 'Khác');

create table campaigns (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid not null references brands (id),
  campaign_type_id  uuid not null references campaign_types (id),
  name              text not null,
  start_date        date not null,
  end_date          date not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint campaign_date_order check (end_date >= start_date)
);
create index campaigns_brand_idx on campaigns (brand_id, start_date);

-- The agency's unit of work. Deliberately independent of a platform room:
-- one room may carry several of these, and one of these may span several rooms.
create table live_sessions (
  id                      uuid primary key default gen_random_uuid(),
  brand_id                uuid not null references brands (id),
  platform_account_id     uuid not null references platform_accounts (id),
  campaign_id             uuid references campaigns (id),

  -- Day the shift began, in GMT+7. A shift ending after midnight keeps the
  -- day it started on; splitting it would break every daily comparison.
  session_date            date not null,
  planned_start_at        timestamptz,
  planned_end_at          timestamptz,
  actual_start_at         timestamptz,
  actual_end_at           timestamptz,

  ownership               session_ownership not null default 'AGENCY',
  ownership_confirmed_by  uuid references users (id),
  ownership_confirmed_at  timestamptz,

  status                  session_status not null default 'DRAFT',
  data_confidence         data_confidence,

  target_gmv              numeric(18, 2),
  target_orders           integer,
  target_source           target_source,

  note                    text,
  created_by              uuid references users (id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint planned_time_order check (
    planned_end_at is null or planned_start_at is null or planned_end_at > planned_start_at
  ),
  constraint actual_time_order check (
    actual_end_at is null or actual_start_at is null or actual_end_at > actual_start_at
  )
);
create index live_sessions_brand_date_idx on live_sessions (brand_id, session_date);
create index live_sessions_account_start_idx on live_sessions (platform_account_id, actual_start_at);
create index live_sessions_awaiting_data_idx on live_sessions (status)
  where status in ('DATA_PENDING', 'DATA_PARTIAL');
create index live_sessions_unknown_owner_idx on live_sessions (ownership)
  where ownership = 'UNKNOWN';

-- started_at/ended_at null means the person covered the whole shift. They are
-- filled in when someone is swapped mid-shift, which does not split the shift.
create table live_session_staff (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references live_sessions (id) on delete cascade,
  user_id          uuid not null references users (id),
  role_in_session  session_staff_role not null,
  started_at       timestamptz,
  ended_at         timestamptz,
  created_at       timestamptz not null default now(),
  constraint staff_time_order check (
    ended_at is null or started_at is null or ended_at > started_at
  )
);
create index live_session_staff_session_idx on live_session_staff (session_id);
create index live_session_staff_user_idx on live_session_staff (user_id);

-- Hours are set per shift rather than chosen from fixed slots: each brand's
-- contract drives a different schedule.
create table shift_slots (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid references live_sessions (id) on delete cascade,
  brand_id     uuid not null references brands (id),
  role_needed  session_staff_role not null,
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  headcount    integer not null default 1,
  status       booking_status not null default 'OPEN',
  created_by   uuid references users (id),
  created_at   timestamptz not null default now(),
  constraint slot_time_order check (end_at > start_at),
  constraint slot_headcount_positive check (headcount > 0)
);
create index shift_slots_brand_start_idx on shift_slots (brand_id, start_at);

create table shift_bookings (
  id           uuid primary key default gen_random_uuid(),
  slot_id      uuid not null references shift_slots (id) on delete cascade,
  user_id      uuid not null references users (id),
  status       booking_status not null default 'REGISTERED',
  reviewed_by  uuid references users (id),
  reviewed_at  timestamptz,
  note         text,
  created_at   timestamptz not null default now(),
  unique (slot_id, user_id)
);
create index shift_bookings_user_idx on shift_bookings (user_id, status);
