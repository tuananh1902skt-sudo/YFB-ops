# 04 — Database Schema (PostgreSQL / Supabase)

Status: DRAFT — v0.1

Schema vật lý, viết dưới dạng DDL để chuyển thẳng thành migration. Ý nghĩa nghiệp vụ của
từng trường nằm ở `02_DATA_DICTIONARY.md`, rule tính toán ở `01_BUSINESS_RULES.md`.

Phạm vi: **nhóm A–E là MVP** (build ngay). Nhóm F–G là placeholder — tạo bảng để không
phải migrate lớn sau này, nhưng chưa build UI.

---

## Quy ước chung

- Khoá chính: `uuid` (`gen_random_uuid()`), trừ bảng raw dùng `bigserial` cho hiệu năng.
- Mọi bảng có `created_at timestamptz not null default now()`; bảng có sửa đổi thì thêm
  `updated_at`.
- Xoá mềm bằng `deleted_at timestamptz` cho các bảng danh mục (client, brand, user…).
  **Không xoá mềm** bảng raw và bảng attribution — đó là dữ liệu kế toán.
- Mọi mốc thời gian dùng `timestamptz`. Hiển thị theo `Asia/Ho_Chi_Minh`.
- Tiền: `numeric(18,2)`. Tỷ lệ %: `numeric(12,6)`, lưu dạng phần trăm (12.5 = 12.5%).

---

## Enums

```sql
create type user_role as enum (
  'SUPER_ADMIN','MANAGEMENT','ACCOUNT','OPERATION','HOST','ASSISTANT',
  'DATA_ANALYST','FINANCE');

create type session_staff_role as enum ('HOST','ASSISTANT');

create type session_status as enum (
  'DRAFT','PLANNING','OPEN_FOR_BOOKING','PENDING_APPROVAL','CONFIRMED','READY',
  'LIVE','DATA_PENDING','DATA_PARTIAL','DATA_COMPLETE','ANALYZED','COMPLETED',
  'CANCELLED');

create type session_ownership as enum ('AGENCY','BRAND_INHOUSE','UNKNOWN');

create type session_event_type as enum (
  'SESSION_STARTED','SESSION_ENDED','HANDOVER_AGENCY_TEAM','HANDOVER_TO_INHOUSE',
  'HANDOVER_FROM_INHOUSE','HOST_CHANGED','ASSISTANT_CHANGED','OVERTIME_EXTENDED',
  'ENDED_EARLY','RESTART_TECHNICAL','RESTART_STRATEGIC','UPLOAD_CORRECTED');

create type event_review_status as enum ('LOGGED','VERIFIED','CORRECTED');

create type attribution_method as enum (
  'FULL_SNAPSHOT','SNAPSHOT_DELTA','ROOM_SUM','MANUAL','SHARED_UNALLOCATED');

create type data_confidence as enum ('HIGH','MEDIUM','LOW','NEEDS_REVIEW');

create type import_type as enum ('LIVE_PERFORMANCE','ADS_DAILY');

create type import_status as enum (
  'UPLOADED','PARSED','VALIDATED','MATCHED','PARTIALLY_MATCHED','NEEDS_REVIEW','FAILED');

create type booking_status as enum (
  'OPEN','REGISTERED','PENDING_APPROVAL','APPROVED','CONFIRMED','REJECTED','CANCELLED');

create type target_rule_type as enum (
  'FIXED_PERIOD_GMV','GMV_PER_HOUR','HYBRID','AGENCY_PROPOSED');

create type target_source as enum ('BRAND','AGENCY','ALLOCATED');

create type fee_component_type as enum (
  'FIXED_PER_HOUR','FIXED_PER_PERIOD','PCT_GMV','PCT_NMV');

create type platform_code as enum ('TIKTOK_SHOP','SHOPEE');
```

---

## Nhóm A — Tổ chức & con người

```sql
create table users (
  id            uuid primary key,              -- khớp auth.users.id của Supabase
  email         text not null unique,
  full_name     text not null,
  phone         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
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
  client_id   uuid not null references clients(id),
  name        text not null,
  code        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (client_id, code)
);

-- Phân quyền: role toàn cục (brand_id null) hoặc theo từng brand
create table user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  role       user_role not null,
  brand_id   uuid references brands(id),
  created_at timestamptz not null default now(),
  unique nulls not distinct (user_id, role, brand_id)
);
create index on user_roles (user_id);
create index on user_roles (brand_id);

create table platform_accounts (
  id                      uuid primary key default gen_random_uuid(),
  brand_id                uuid not null references brands(id),
  platform                platform_code not null default 'TIKTOK_SHOP',
  account_name            text not null,
  external_shop_id        text,
  timezone                text not null default 'Asia/Ho_Chi_Minh',
  estimated_refund_rate   numeric(6,4) not null default 0,   -- 0.0500 = 5%
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint refund_rate_range check (estimated_refund_rate >= 0 and estimated_refund_rate < 1)
);
create index on platform_accounts (brand_id);

-- Ngưỡng cấu hình được, không hard-code trong code (CLAUDE.md rule 12)
create table system_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid references users(id),
  updated_at  timestamptz not null default now()
);
```

Giá trị seed sẵn: `data_submission_grace_minutes` = 30,
`room_continuity_max_gap_hours` = 8, `segment_match_min_overlap_minutes` = 2,
`segment_match_min_overlap_ratio` = 0.1.

---

## Nhóm B — Campaign & Planning

```sql
create table campaign_types (              -- bảng tham chiếu, agency tự thêm được
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,        -- DAILY, PAYDAY, MEGA_CAMPAIGN...
  name        text not null,
  is_active   boolean not null default true
);

create table campaigns (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid not null references brands(id),
  campaign_type_id  uuid not null references campaign_types(id),
  name              text not null,
  start_date        date not null,
  end_date          date not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint campaign_date_order check (end_date >= start_date)
);
create index on campaigns (brand_id, start_date);
```

### Ca live — bảng trung tâm

```sql
create table live_sessions (
  id                   uuid primary key default gen_random_uuid(),
  brand_id             uuid not null references brands(id),
  platform_account_id  uuid not null references platform_accounts(id),
  campaign_id          uuid references campaigns(id),

  session_date         date not null,          -- ngày BẮT ĐẦU ca (ca qua nửa đêm không tách)
  planned_start_at     timestamptz,
  planned_end_at       timestamptz,
  actual_start_at      timestamptz,
  actual_end_at        timestamptz,

  ownership            session_ownership not null default 'AGENCY',
  ownership_confirmed_by uuid references users(id),
  ownership_confirmed_at timestamptz,

  status               session_status not null default 'DRAFT',
  data_confidence      data_confidence,

  target_gmv           numeric(18,2),
  target_orders        integer,
  target_source        target_source,

  note                 text,
  created_by           uuid references users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint planned_time_order check (planned_end_at is null or planned_start_at is null
                                       or planned_end_at > planned_start_at),
  constraint actual_time_order  check (actual_end_at is null or actual_start_at is null
                                       or actual_end_at > actual_start_at)
);
create index on live_sessions (brand_id, session_date);
create index on live_sessions (platform_account_id, actual_start_at);
create index on live_sessions (status) where status in ('DATA_PENDING','DATA_PARTIAL');
create index on live_sessions (ownership) where ownership = 'UNKNOWN';
```

```sql
create table live_session_staff (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references live_sessions(id) on delete cascade,
  user_id          uuid not null references users(id),
  role_in_session  session_staff_role not null,
  started_at       timestamptz,        -- null = đảm nhiệm toàn ca
  ended_at         timestamptz,
  created_at       timestamptz not null default now()
);
create index on live_session_staff (session_id);
create index on live_session_staff (user_id);
```

### Mở ca & đăng ký ca

```sql
create table shift_slots (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid references live_sessions(id) on delete cascade,
  brand_id             uuid not null references brands(id),
  role_needed          session_staff_role not null,
  start_at             timestamptz not null,
  end_at               timestamptz not null,
  headcount            integer not null default 1,
  status               booking_status not null default 'OPEN',
  created_by           uuid references users(id),
  created_at           timestamptz not null default now(),
  constraint slot_time_order check (end_at > start_at)
);
create index on shift_slots (brand_id, start_at);

create table shift_bookings (
  id           uuid primary key default gen_random_uuid(),
  slot_id      uuid not null references shift_slots(id) on delete cascade,
  user_id      uuid not null references users(id),
  status       booking_status not null default 'REGISTERED',
  reviewed_by  uuid references users(id),
  reviewed_at  timestamptz,
  note         text,
  created_at   timestamptz not null default now(),
  unique (slot_id, user_id)
);
create index on shift_bookings (user_id, status);
```

---

## Nhóm C — Raw data & Import

```sql
create table import_mappings (
  id                uuid primary key default gen_random_uuid(),
  import_type       import_type not null,
  header_signature  text not null,     -- hash danh sách tên cột
  header_columns    jsonb not null,    -- mảng tên cột gốc, đúng thứ tự
  mapping           jsonb not null,    -- { "Attributed GMV": "gmv", ... }
  version           integer not null default 1,
  created_by        uuid references users(id),
  created_at        timestamptz not null default now(),
  unique (import_type, header_signature)
);

create table raw_imports (
  id                   uuid primary key default gen_random_uuid(),
  import_type          import_type not null,
  platform_account_id  uuid not null references platform_accounts(id),
  file_name            text not null,
  file_hash            text not null,
  storage_path         text not null,          -- Supabase Storage
  mapping_id           uuid references import_mappings(id),
  data_period_start    date,
  data_period_end      date,
  row_count            integer,
  status               import_status not null default 'UPLOADED',
  error_summary        jsonb,
  uploaded_by          uuid not null references users(id),
  uploaded_at          timestamptz not null default now()
);
create index on raw_imports (platform_account_id, uploaded_at desc);
create index on raw_imports (file_hash);

-- Bất biến: giữ nguyên văn string gốc của mọi ô
create table raw_import_rows (
  id          bigserial primary key,
  import_id   uuid not null references raw_imports(id) on delete cascade,
  row_index   integer not null,
  raw_values  jsonb not null,
  parse_error text,
  created_at  timestamptz not null default now(),
  unique (import_id, row_index)
);
```

### Room & Snapshot

```sql
create table platform_rooms (
  id                   uuid primary key default gen_random_uuid(),
  platform_account_id  uuid not null references platform_accounts(id),
  platform_room_id     text not null,           -- LUÔN là text: 19 chữ số
  room_start_at        timestamptz not null,
  room_title           text,                    -- metadata, không dùng làm khoá nghiệp vụ
  created_at           timestamptz not null default now(),
  unique (platform_account_id, platform_room_id, room_start_at)
);
create index on platform_rooms (platform_account_id, room_start_at);

create table room_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  room_id             uuid not null references platform_rooms(id),
  raw_import_row_id   bigint not null references raw_import_rows(id),
  snapshot_end_at     timestamptz not null,     -- cột End Time = thời điểm tải report
  duration_minutes    integer,

  -- Trường CỘNG DỒN (được phép trừ để tách ca)
  gmv                 numeric(18,2),
  items_sold          integer,
  orders              integer,
  sku_orders          integer,
  customers           integer,                  -- cộng dồn xấp xỉ (khách trùng)
  views               integer,
  impressions         integer,
  product_impressions integer,
  product_clicks      integer,
  new_followers       integer,
  comments            integer,
  shares              integer,
  likes               integer,

  -- Trường DẪN XUẤT: lưu y nguyên số TikTok báo, chỉ để đối chiếu. CẤM dùng phép trừ.
  reported_derived    jsonb,

  created_at          timestamptz not null default now(),
  unique (room_id, snapshot_end_at)
);
create index on room_snapshots (room_id, snapshot_end_at);
```

### Ads (chỉ lưu cấp ngày — xem `01_BUSINESS_RULES.md` mục 10)

```sql
create table ads_daily (
  id                   uuid primary key default gen_random_uuid(),
  platform_account_id  uuid not null references platform_accounts(id),
  stat_date            date not null,
  ads_spend            numeric(18,2) not null,
  ads_sku_orders       integer,
  ads_gross_revenue    numeric(18,2),           -- TOÀN SHOP, không phải GMV live
  currency             text not null default 'VND',
  import_id            uuid references raw_imports(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (platform_account_id, stat_date)       -- import lại thì ghi đè, có audit log
);
```

---

## Nhóm D — Attribution & Event Log

```sql
create table session_events (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references live_sessions(id) on delete cascade,
  event_type         session_event_type not null,
  occurred_at        timestamptz not null,
  room_id            uuid references platform_rooms(id),
  related_session_id uuid references live_sessions(id),   -- ca nhận bàn giao
  from_user_id       uuid references users(id),
  to_user_id         uuid references users(id),
  reason             text,
  review_status      event_review_status not null default 'LOGGED',
  reviewed_by        uuid references users(id),
  reviewed_at        timestamptz,
  created_by         uuid not null references users(id),
  created_at         timestamptz not null default now(),

  -- Lý do bắt buộc với các loại event nhạy cảm
  constraint reason_required check (
    event_type not in ('ENDED_EARLY','RESTART_TECHNICAL','RESTART_STRATEGIC','UPLOAD_CORRECTED')
    or (reason is not null and length(btrim(reason)) > 0)
  )
);
create index on session_events (session_id, occurred_at);
create index on session_events (review_status) where review_status = 'LOGGED';
```

```sql
-- Kết quả đã tách riêng cho từng ca. Một ca có thể có NHIỀU dòng (khi restart nhiều Room).
create table session_attributions (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references live_sessions(id) on delete cascade,
  room_id             uuid not null references platform_rooms(id),
  method              attribution_method not null,
  source_snapshot_id  uuid references room_snapshots(id),   -- snapshot chốt ca
  prev_snapshot_id    uuid references room_snapshots(id),   -- snapshot ca liền trước

  -- Mốc và thời lượng của riêng đoạn này. KHÔNG lấy cột Duration của file
  -- (đó là thời lượng cả Room — xem 05_KPI_DICTIONARY.md mục 2.1)
  segment_start_at    timestamptz,
  segment_end_at      timestamptz,
  duration_minutes    numeric(10,2),

  gmv                 numeric(18,2),
  items_sold          integer,
  orders              integer,
  sku_orders          integer,
  customers           integer,
  views               integer,
  impressions         integer,
  product_impressions integer,
  product_clicks      integer,
  new_followers       integer,
  comments            integer,
  shares              integer,
  likes               integer,

  confidence          data_confidence not null,
  is_current          boolean not null default true,        -- giữ lịch sử khi tính lại
  computed_at         timestamptz not null default now(),
  computed_reason     text,
  overridden_by       uuid references users(id),
  override_reason     text,

  constraint manual_needs_reason check (
    method <> 'MANUAL' or (override_reason is not null and length(btrim(override_reason)) > 0)
  ),
  constraint no_negative_gmv check (gmv is null or gmv >= 0),
  constraint no_negative_orders check (orders is null or orders >= 0),
  -- Đoạn chưa quy kết được thì KHÔNG mang số — chặn việc chia đôi ở tầng DB
  constraint shared_has_no_figures check (
    method <> 'SHARED_UNALLOCATED' or (gmv is null and orders is null)
  )
);
create index on session_attributions (session_id) where is_current;
create index on session_attributions (room_id);
create unique index on session_attributions (session_id, room_id) where is_current;
```

Ghi chú quan trọng:
- `no_negative_gmv` — nếu phép trừ ra số âm thì **không được ghi**; engine phải đặt ca đó
  vào `NEEDS_REVIEW` (dấu hiệu snapshot sai thứ tự hoặc gắn nhầm ca).
- Khi thiếu snapshot ở ranh giới, tạo dòng `SHARED_UNALLOCATED` với các chỉ số để `null`
  — **không chia đều**.
- Tính lại thì set `is_current = false` cho dòng cũ, chèn dòng mới — không update đè, để
  giữ vết.

```sql
-- Tổng hợp kết quả 1 ca = cộng các dòng attribution hiện hành.
-- Dùng view để chỉ có MỘT nguồn sự thật; nâng lên materialized view nếu cần hiệu năng.
create view session_results as
select
  s.id                as session_id,
  s.brand_id,
  s.session_date,
  s.ownership,
  s.target_gmv,
  sum(a.gmv)          as gmv,
  sum(a.orders)       as orders,
  sum(a.items_sold)   as items_sold,
  sum(a.views)        as views,
  sum(a.product_clicks) as product_clicks,
  -- Giờ live = tổng thời lượng các đoạn thuộc ca, KHÔNG lấy actual_start/end
  -- (OT, off sớm, restart làm hai thứ này lệch nhau)
  sum(a.duration_minutes) as live_minutes,
  bool_or(a.method = 'SHARED_UNALLOCATED') as has_unallocated,
  -- Lấy mức tin cậy THẤP NHẤT. Không dùng min() trên chuỗi: thứ tự chữ cái
  -- cho ra 'HIGH' đầu tiên, tức là ngược hẳn ý nghĩa cần có.
  (array['HIGH','MEDIUM','LOW','NEEDS_REVIEW'])[
    max(case a.confidence
          when 'HIGH' then 1 when 'MEDIUM' then 2 when 'LOW' then 3 else 4 end)
  ]::data_confidence as confidence
from live_sessions s
join session_attributions a on a.session_id = s.id and a.is_current
group by s.id;
```

> Công thức KPI dẫn xuất (AOV, CTR, GMV/giờ, achievement…) **không** tính trong view này
> mà tập trung ở KPI service — xem `05_KPI_DICTIONARY.md`. Lý do: tránh mỗi nơi tự tính
> một kiểu.

---

## Nhóm E — Target

```sql
create table target_rules (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null references brands(id),
  rule_type      target_rule_type not null,
  config         jsonb not null default '{}'::jsonb,
  effective_from date not null,
  effective_to   date,
  created_by     uuid references users(id),
  created_at     timestamptz not null default now()
);
create index on target_rules (brand_id, effective_from desc);

create table targets (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references brands(id),
  session_id    uuid references live_sessions(id),  -- null = target cấp kỳ
  campaign_id   uuid references campaigns(id),
  period_start  date,
  period_end    date,
  target_gmv    numeric(18,2),
  target_orders integer,
  target_hours  numeric(10,2),
  source        target_source not null,
  note          text,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  constraint target_scope check (session_id is not null or (period_start is not null and period_end is not null))
);
create index on targets (brand_id, period_start);

create table target_allocations (
  id                uuid primary key default gen_random_uuid(),
  period_target_id  uuid not null references targets(id) on delete cascade,
  session_id        uuid not null references live_sessions(id) on delete cascade,
  allocated_gmv     numeric(18,2) not null,
  weight            numeric(10,6),
  method            text not null,             -- 'HISTORICAL_TIMESLOT', 'MANUAL'...
  is_override       boolean not null default false,
  overridden_by     uuid references users(id),
  reason            text,
  created_at        timestamptz not null default now(),
  unique (period_target_id, session_id)
);
```

---

## Nhóm F — Hợp đồng & doanh thu (placeholder, chưa build UI)

```sql
create table contracts (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null references brands(id),
  start_date     date not null,
  end_date       date,
  payment_terms  text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table contract_fee_components (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references contracts(id) on delete cascade,
  component_type fee_component_type not null,
  value        numeric(18,4) not null,     -- đồng/giờ, đồng/kỳ, hoặc % (5.0 = 5%)
  config       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
```

---

## Nhóm G — Audit & Notification

```sql
create table audit_logs (
  id           bigserial primary key,
  entity_type  text not null,
  entity_id    text not null,
  action       text not null,
  before_data  jsonb,
  after_data   jsonb,
  reason       text,
  actor_id     uuid references users(id),
  created_at   timestamptz not null default now()
);
create index on audit_logs (entity_type, entity_id, created_at desc);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  type        text not null,
  payload     jsonb not null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on notifications (user_id, created_at desc) where read_at is null;
```

---

## Bảo mật (Supabase RLS)

Bật RLS trên **tất cả** bảng nghiệp vụ. Nguyên tắc:

1. `SUPER_ADMIN`, `MANAGEMENT`, `DATA_ANALYST`, `FINANCE`: đọc toàn bộ (FINANCE giới hạn
   ở nhóm F + kết quả tổng hợp).
2. `ACCOUNT`, `OPERATION`: chỉ các brand được gán trong `user_roles`.
3. `HOST`, `ASSISTANT`: chỉ ca mà họ được phân công (`live_session_staff`) và các
   `shift_slots` đang mở của brand họ có quyền.
4. Ghi dữ liệu raw: chỉ user đã đăng nhập có quyền trên `platform_account` tương ứng.
5. **Không có policy update/delete** trên `raw_import_rows`, `room_snapshots` — chỉ
   insert. Sửa sai đi qua import mới + `UPLOAD_CORRECTED` event.

Helper function dùng chung trong policy:

```sql
create or replace function auth_has_brand_access(target_brand uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from user_roles ur
    where ur.user_id = auth.uid()
      and (ur.brand_id = target_brand
           or ur.role in ('SUPER_ADMIN','MANAGEMENT','DATA_ANALYST'))
  );
$$;
```

---

## Thứ tự migration đề xuất

1. Enums + Nhóm A (tổ chức)
2. Nhóm B (campaign, session, shift)
3. Nhóm C (import, room, snapshot, ads)
4. Nhóm D (event, attribution, view kết quả)
5. Nhóm E (target)
6. RLS policies
7. Nhóm F, G (placeholder)

---

## Điểm cần rà lại trước khi khoá schema

1. `session_results` để là view hay materialized view — quyết định sau khi đo hiệu năng
   với dữ liệu thật (4 brand, ~110 room/2.5 tháng → dữ liệu còn rất nhỏ, view là đủ).
2. `customers` cộng dồn xấp xỉ khi trừ delta — cần hiển thị nhãn xấp xỉ trên UI, hoặc
   cân nhắc không hiển thị ở cấp ca.
3. Chưa có bảng `products`/`skus` — file export hiện tại **không có dữ liệu SKU**. Khi
   nào agency cần Product Intelligence thì phải tìm nguồn export riêng trước, rồi mới
   thiết kế bảng.

---

## Bổ sung: policy `shift_bookings_cancel_own`

Người đăng ký tự rút tên được, nhưng chỉ khi đăng ký còn ở `REGISTERED` /
`PENDING_APPROVAL` và chỉ được chuyển sang `CANCELLED`. Sau khi duyệt thì ca đã xếp
người quanh họ nên đổi người là việc của Operation (`01_BUSINESS_RULES.md` mục 6b).

Policy này cố ý **không** cho tự đổi sang `APPROVED` — kiểm chứng ở
`scripts/verify-rls.sql`.

---

## Bổ sung: kho file `imports` (Supabase Storage)

Bucket **private** tên `imports`, tạo bởi migration `20260917000009_import_storage.sql`
chứ không tạo bằng tay trên giao diện Supabase — một bucket tạo tay sẽ không có policy
đi kèm, và lỗi đó chỉ lộ ra khi người dùng thật bấm nộp file.

Đường dẫn file: `<platform_account_id>/<sha256>.xlsx` (hàm `storagePathFor`). Tên file
là hash nội dung nên cùng một file luôn rơi vào cùng một chỗ, upload lại là ghi đè
chính nó.

Brand sở hữu file suy ra từ thư mục đầu tiên qua hàm `import_object_brand(name)`. Hàm
này trả `null` nếu đoạn đầu không phải UUID, và mọi policy đều kiểm `is not null`
trước khi gọi `has_brand_access`:

| Policy | Thao tác | Điều kiện |
|---|---|---|
| `imports_read` | select | brand của file suy ra được **và** người đọc có quyền trên brand đó |
| `imports_insert` | insert | như trên |
| `imports_update` | update | như trên (cần cho việc upload đè cùng một file) |
| — | delete | **không có policy**: report đã nộp là bằng chứng (CLAUDE.md §2) |

Chốt `is not null` là bắt buộc chứ không phải phòng xa: `has_brand_access` trả `true`
cho vai trò toàn hệ thống với **mọi** tham số, kể cả `null`. Bỏ chốt này thì một file
đặt sai đường dẫn sẽ lọt qua tay SUPER_ADMIN. `scripts/verify-rls.sql` có assertion
chứng minh đúng điều đó — thử bỏ chốt ra thì assertion đổ.
