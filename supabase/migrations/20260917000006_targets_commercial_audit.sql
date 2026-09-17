-- Targets, contracts and the audit trail.

-- Each brand sets targets its own way, so the shape lives in config rather
-- than in columns.
create table target_rules (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references brands (id),
  rule_type       target_rule_type not null,
  config          jsonb not null default '{}'::jsonb,
  effective_from  date not null,
  effective_to    date,
  created_by      uuid references users (id),
  created_at      timestamptz not null default now(),
  constraint target_rule_date_order check (effective_to is null or effective_to >= effective_from)
);
create index target_rules_brand_idx on target_rules (brand_id, effective_from desc);

create table targets (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null references brands (id),
  session_id     uuid references live_sessions (id),
  campaign_id    uuid references campaigns (id),
  period_start   date,
  period_end     date,
  target_gmv     numeric(18, 2),
  target_orders  integer,
  target_hours   numeric(10, 2),
  source         target_source not null,
  note           text,
  created_by     uuid references users (id),
  created_at     timestamptz not null default now(),
  constraint target_scope check (
    session_id is not null or (period_start is not null and period_end is not null)
  )
);
create index targets_brand_period_idx on targets (brand_id, period_start);
create index targets_session_idx on targets (session_id);

create table target_allocations (
  id                uuid primary key default gen_random_uuid(),
  period_target_id  uuid not null references targets (id) on delete cascade,
  session_id        uuid not null references live_sessions (id) on delete cascade,
  allocated_gmv     numeric(18, 2) not null,
  weight            numeric(10, 6),
  method            text not null,
  is_override       boolean not null default false,
  overridden_by     uuid references users (id),
  reason            text,
  created_at        timestamptz not null default now(),
  unique (period_target_id, session_id),
  constraint override_needs_reason check (
    not is_override or (reason is not null and length(btrim(reason)) > 0)
  )
);

-- Commercial terms vary per deal: hourly fee, retainer, percentage of GMV or
-- NMV, or a combination. Components are summed rather than fixed in columns.
create table contracts (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null references brands (id),
  start_date     date not null,
  end_date       date,
  payment_terms  text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  constraint contract_date_order check (end_date is null or end_date >= start_date)
);
create index contracts_brand_idx on contracts (brand_id);

create table contract_fee_components (
  id              uuid primary key default gen_random_uuid(),
  contract_id     uuid not null references contracts (id) on delete cascade,
  component_type  fee_component_type not null,
  value           numeric(18, 4) not null,
  config          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index contract_fee_components_contract_idx on contract_fee_components (contract_id);

create table audit_logs (
  id           bigserial primary key,
  entity_type  text not null,
  entity_id    text not null,
  action       text not null,
  before_data  jsonb,
  after_data   jsonb,
  reason       text,
  actor_id     uuid references users (id),
  created_at   timestamptz not null default now()
);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id, created_at desc);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users (id) on delete cascade,
  type        text not null,
  payload     jsonb not null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_unread_idx on notifications (user_id, created_at desc) where read_at is null;
