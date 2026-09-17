import type { SupabaseClient } from '@supabase/supabase-js';
import { formatDate } from '../format';
import type {
  DetailAttribution,
  DetailSnapshot,
  SessionDetail,
} from './detail-types';
import type { SessionEventType } from './events';

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Every stored figure names the upload it came from, three joins down. */
const SNAPSHOT_SELECT =
  'id,snapshot_end_at,gmv::text,orders,raw_import_rows(import_id,raw_imports(file_name))';

interface RawSnapshot {
  id: string;
  snapshot_end_at: string;
  gmv: string | null;
  orders: number | null;
  raw_import_rows:
    | { import_id: string; raw_imports: { file_name: string } | { file_name: string }[] | null }
    | { import_id: string; raw_imports: { file_name: string } | { file_name: string }[] | null }[]
    | null;
}

function toSnapshot(raw: RawSnapshot | null): DetailSnapshot | null {
  if (!raw) return null;
  const row = first(raw.raw_import_rows);
  return {
    snapshotId: raw.id,
    endAt: raw.snapshot_end_at,
    gmv: raw.gmv,
    orders: raw.orders,
    importId: row?.import_id ?? null,
    fileName: first(row?.raw_imports ?? null)?.file_name ?? null,
  };
}

export async function loadSessionDetail(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<SessionDetail | null> {
  const session = await supabase
    .from('live_sessions')
    .select(
      'id,session_date,status,ownership,data_confidence,target_gmv::text,planned_start_at,planned_end_at,actual_start_at,actual_end_at,brands(name),live_session_staff(role_in_session,started_at,ended_at,users(full_name))',
    )
    .eq('id', sessionId)
    .maybeSingle();
  fail('đọc ca', session.error);
  if (!session.data) return null;

  const [events, attributions, audits] = await Promise.all([
    supabase
      .from('session_events')
      .select('id,event_type,occurred_at,reason,review_status,users:created_by(full_name)')
      .eq('session_id', sessionId)
      .order('occurred_at'),
    supabase
      .from('session_attributions')
      .select(
        `id,method,confidence,segment_start_at,segment_end_at,duration_minutes,gmv::text,orders,items_sold,customers,views,product_impressions,product_clicks,new_followers,computed_reason,override_reason,computed_at,is_current,platform_rooms(platform_room_id),source:room_snapshots!session_attributions_source_snapshot_id_fkey(${SNAPSHOT_SELECT}),previous:room_snapshots!session_attributions_prev_snapshot_id_fkey(${SNAPSHOT_SELECT})`,
      )
      // Superseded rows are kept: this screen is where someone asks what the
      // number used to be and why it changed.
      .eq('session_id', sessionId)
      .order('computed_at'),
    supabase
      .from('audit_logs')
      .select('id,action,reason,created_at,users:actor_id(full_name)')
      .eq('entity_type', 'live_sessions')
      .eq('entity_id', sessionId)
      .order('created_at'),
  ]);

  fail('đọc diễn biến ca', events.error);
  fail('đọc kết quả ca', attributions.error);
  // Audit logs are restricted to Operation and above; an assistant simply sees
  // no history section rather than an error.
  const auditRows = audits.error ? [] : (audits.data ?? []);

  const staff = (Array.isArray(session.data.live_session_staff)
    ? session.data.live_session_staff
    : []) as {
    role_in_session: 'HOST' | 'ASSISTANT';
    started_at: string | null;
    ended_at: string | null;
    users: { full_name: string } | { full_name: string }[] | null;
  }[];

  return {
    sessionId: session.data.id,
    brandName: first(session.data.brands as { name: string } | { name: string }[] | null)?.name ?? '',
    sessionDate: formatDate(new Date(`${session.data.session_date}T00:00:00+07:00`)),
    status: session.data.status,
    ownership: session.data.ownership,
    confidence: session.data.data_confidence,
    plannedStartAt: session.data.planned_start_at,
    plannedEndAt: session.data.planned_end_at,
    actualStartAt: session.data.actual_start_at,
    actualEndAt: session.data.actual_end_at,
    targetGmv: session.data.target_gmv,
    staff: staff.map((row) => ({
      name: first(row.users)?.full_name ?? '',
      role: row.role_in_session,
      startedAt: row.started_at,
      endedAt: row.ended_at,
    })),
    events: (events.data ?? []).map((row) => ({
      id: row.id,
      eventType: row.event_type as SessionEventType,
      occurredAt: row.occurred_at,
      reason: row.reason,
      reviewStatus: row.review_status,
      actorName:
        first(row.users as { full_name: string } | { full_name: string }[] | null)?.full_name ?? null,
    })),
    attributions: ((attributions.data ?? []) as unknown as RawAttribution[]).map(
      (row): DetailAttribution => ({
        id: row.id,
        method: row.method,
        confidence: row.confidence,
        platformRoomId: first(row.platform_rooms)?.platform_room_id ?? null,
        segmentStartAt: row.segment_start_at,
        segmentEndAt: row.segment_end_at,
        durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes),
        gmv: row.gmv,
        orders: row.orders,
        itemsSold: row.items_sold,
        customers: row.customers,
        views: row.views,
        productImpressions: row.product_impressions,
        productClicks: row.product_clicks,
        newFollowers: row.new_followers,
        sourceSnapshot: toSnapshot(first(row.source)),
        previousSnapshot: toSnapshot(first(row.previous)),
        computedReason: row.computed_reason,
        overrideReason: row.override_reason,
        computedAt: row.computed_at,
        isCurrent: row.is_current,
      }),
    ),
    auditLogs: auditRows.map((row) => ({
      id: String(row.id),
      action: row.action,
      reason: row.reason,
      createdAt: row.created_at,
      actorName:
        first(row.users as { full_name: string } | { full_name: string }[] | null)?.full_name ?? null,
    })),
  };
}

interface RawAttribution {
  id: string;
  method: DetailAttribution['method'];
  confidence: DetailAttribution['confidence'];
  segment_start_at: string | null;
  segment_end_at: string | null;
  duration_minutes: string | number | null;
  gmv: string | null;
  orders: number | null;
  items_sold: number | null;
  customers: number | null;
  views: number | null;
  product_impressions: number | null;
  product_clicks: number | null;
  new_followers: number | null;
  computed_reason: string | null;
  override_reason: string | null;
  computed_at: string;
  is_current: boolean;
  platform_rooms: { platform_room_id: string } | { platform_room_id: string }[] | null;
  source: RawSnapshot | RawSnapshot[] | null;
  previous: RawSnapshot | RawSnapshot[] | null;
}
