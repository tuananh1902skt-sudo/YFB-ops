-- What happened during a shift, and which platform figures belong to it.

-- Logged by the assistant as it happens; Operation reviews afterwards rather
-- than approving up front, so logging never blocks a live shift.
create table session_events (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references live_sessions (id) on delete cascade,
  event_type          session_event_type not null,
  occurred_at         timestamptz not null,
  room_id             uuid references platform_rooms (id),
  related_session_id  uuid references live_sessions (id),
  from_user_id        uuid references users (id),
  to_user_id          uuid references users (id),
  reason              text,
  review_status       event_review_status not null default 'LOGGED',
  reviewed_by         uuid references users (id),
  reviewed_at         timestamptz,
  created_by          uuid not null references users (id),
  created_at          timestamptz not null default now(),

  -- These events are the ones analysts later need explained, so the reason is
  -- required by the database, not just by the form.
  constraint reason_required check (
    event_type not in ('ENDED_EARLY', 'RESTART_TECHNICAL', 'RESTART_STRATEGIC', 'UPLOAD_CORRECTED')
    or (reason is not null and length(btrim(reason)) > 0)
  )
);
create index session_events_session_idx on session_events (session_id, occurred_at);
create index session_events_pending_review_idx on session_events (review_status)
  where review_status = 'LOGGED';

-- One row per room stretch credited to a shift. A restarted shift has several
-- rows; a shift whose boundary snapshot is missing has one with no figures.
create table session_attributions (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references live_sessions (id) on delete cascade,
  room_id              uuid not null references platform_rooms (id),
  method               attribution_method not null,
  source_snapshot_id   uuid references room_snapshots (id),
  prev_snapshot_id     uuid references room_snapshots (id),

  segment_start_at     timestamptz,
  segment_end_at       timestamptz,
  -- Airtime of this stretch alone. The export's Duration column covers the
  -- whole room, which would overstate a handed-over shift several times over.
  duration_minutes     numeric(10, 2),

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

  confidence           data_confidence not null,
  is_current           boolean not null default true,
  computed_at          timestamptz not null default now(),
  computed_reason      text,
  overridden_by        uuid references users (id),
  override_reason      text,

  constraint manual_needs_reason check (
    method <> 'MANUAL' or (override_reason is not null and length(btrim(override_reason)) > 0)
  ),
  -- Cumulative totals only grow, so a negative result means the snapshots are
  -- out of order or tagged to the wrong shift. Such a result is never stored.
  constraint no_negative_gmv check (gmv is null or gmv >= 0),
  constraint no_negative_orders check (orders is null or orders >= 0),
  -- Figures covering several shifts at once are not split; they are recorded
  -- without values until the missing snapshot or a manual decision resolves it.
  constraint shared_has_no_figures check (
    method <> 'SHARED_UNALLOCATED' or (gmv is null and orders is null)
  )
);
create index session_attributions_current_idx on session_attributions (session_id) where is_current;
create index session_attributions_room_idx on session_attributions (room_id);
create index session_attributions_snapshot_idx on session_attributions (source_snapshot_id);
create unique index session_attributions_one_per_room_idx
  on session_attributions (session_id, room_id) where is_current;

-- A single place to read a shift's totals. Derived metrics (AOV, CVR, GMV per
-- hour…) are not here: they are computed by the KPI service so that every
-- screen gets the same number from the same formula.
create view session_results as
select
  s.id                                      as session_id,
  s.brand_id,
  s.platform_account_id,
  s.session_date,
  s.ownership,
  s.campaign_id,
  s.target_gmv,
  sum(a.gmv)                                as gmv,
  sum(a.orders)                             as orders,
  sum(a.items_sold)                         as items_sold,
  sum(a.sku_orders)                         as sku_orders,
  sum(a.customers)                          as customers,
  sum(a.views)                              as views,
  sum(a.impressions)                        as impressions,
  sum(a.product_impressions)                as product_impressions,
  sum(a.product_clicks)                     as product_clicks,
  sum(a.new_followers)                      as new_followers,
  sum(a.comments)                           as comments,
  sum(a.shares)                             as shares,
  sum(a.likes)                              as likes,
  sum(a.duration_minutes)                   as live_minutes,
  count(distinct a.room_id)                 as room_count,
  bool_or(a.method = 'SHARED_UNALLOCATED')  as has_unallocated,
  -- The weakest link decides: one stretch needing review makes the shift's
  -- figures need review.
  (array['HIGH', 'MEDIUM', 'LOW', 'NEEDS_REVIEW'])[
    max(case a.confidence
          when 'HIGH' then 1
          when 'MEDIUM' then 2
          when 'LOW' then 3
          else 4
        end)
  ]::data_confidence                        as confidence
from live_sessions s
join session_attributions a on a.session_id = s.id and a.is_current
group by s.id;
