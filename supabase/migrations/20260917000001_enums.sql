-- Canonical value sets. Anything user-facing maps to one of these
-- (docs/02_DATA_DICTIONARY.md §2).

create type user_role as enum (
  'SUPER_ADMIN', 'MANAGEMENT', 'ACCOUNT', 'OPERATION', 'HOST', 'ASSISTANT',
  'DATA_ANALYST', 'FINANCE'
);

create type session_staff_role as enum ('HOST', 'ASSISTANT');

create type session_status as enum (
  'DRAFT', 'PLANNING', 'OPEN_FOR_BOOKING', 'PENDING_APPROVAL', 'CONFIRMED', 'READY',
  'LIVE', 'DATA_PENDING', 'DATA_PARTIAL', 'DATA_COMPLETE', 'ANALYZED', 'COMPLETED',
  'CANCELLED'
);

create type session_ownership as enum ('AGENCY', 'BRAND_INHOUSE', 'UNKNOWN');

create type session_event_type as enum (
  'SESSION_STARTED', 'SESSION_ENDED', 'HANDOVER_AGENCY_TEAM', 'HANDOVER_TO_INHOUSE',
  'HANDOVER_FROM_INHOUSE', 'HOST_CHANGED', 'ASSISTANT_CHANGED', 'OVERTIME_EXTENDED',
  'ENDED_EARLY', 'RESTART_TECHNICAL', 'RESTART_STRATEGIC', 'UPLOAD_CORRECTED'
);

create type event_review_status as enum ('LOGGED', 'VERIFIED', 'CORRECTED');

create type attribution_method as enum (
  'FULL_SNAPSHOT', 'SNAPSHOT_DELTA', 'ROOM_SUM', 'MANUAL', 'SHARED_UNALLOCATED'
);

create type data_confidence as enum ('HIGH', 'MEDIUM', 'LOW', 'NEEDS_REVIEW');

create type import_type as enum ('LIVE_PERFORMANCE', 'ADS_DAILY');

create type import_status as enum (
  'UPLOADED', 'PARSED', 'VALIDATED', 'MATCHED', 'PARTIALLY_MATCHED', 'NEEDS_REVIEW', 'FAILED'
);

create type booking_status as enum (
  'OPEN', 'REGISTERED', 'PENDING_APPROVAL', 'APPROVED', 'CONFIRMED', 'REJECTED', 'CANCELLED'
);

create type target_rule_type as enum (
  'FIXED_PERIOD_GMV', 'GMV_PER_HOUR', 'HYBRID', 'AGENCY_PROPOSED'
);

create type target_source as enum ('BRAND', 'AGENCY', 'ALLOCATED');

create type fee_component_type as enum (
  'FIXED_PER_HOUR', 'FIXED_PER_PERIOD', 'PCT_GMV', 'PCT_NMV'
);

create type platform_code as enum ('TIKTOK_SHOP', 'SHOPEE');
