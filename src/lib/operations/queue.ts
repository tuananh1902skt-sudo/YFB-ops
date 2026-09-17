import type { SupabaseClient } from '@supabase/supabase-js';
import { Decimal } from 'decimal.js';
import { sumUnallocated, type UnallocatedRow } from './unallocated';
import type { QueueCount, UnknownStretch, NearbySession } from './types';

const DEFAULT_GRACE_MINUTES = 30;
/** A booked shift within this much of a stretch is worth offering as its owner. */
const NEARBY_WINDOW_HOURS = 12;

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export async function readGraceMinutes(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'data_submission_grace_minutes')
    .maybeSingle();
  return Number(data?.value ?? DEFAULT_GRACE_MINUTES);
}

/**
 * The counts behind Operation's landing screen.
 *
 * Only rows the signed-in person may see are counted, because the queries run
 * through their own client: a brand's backlog never leaks into another brand's
 * screen by way of a number.
 */
export async function loadQueueCounts(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<QueueCount[]> {
  const graceMinutes = await readGraceMinutes(supabase);
  const overdueBefore = new Date(now.getTime() - graceMinutes * 60_000).toISOString();

  const [overdue, needsReview, unknownOwnership, pendingEvents, unallocated, unstaffed, pendingBookings] =
    await Promise.all([
      supabase
        .from('live_sessions')
        .select('id', { count: 'exact', head: true })
        .in('status', ['LIVE', 'DATA_PENDING'])
        .lt('planned_end_at', overdueBefore),
      supabase
        .from('live_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('data_confidence', 'NEEDS_REVIEW'),
      supabase
        .from('live_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('ownership', 'UNKNOWN')
        .neq('status', 'CANCELLED'),
      supabase
        .from('session_events')
        .select('id', { count: 'exact', head: true })
        .eq('review_status', 'LOGGED'),
      supabase
        .from('session_attributions')
        .select(
          'source_snapshot_id,prev_snapshot_id,source:room_snapshots!session_attributions_source_snapshot_id_fkey(gmv::text),previous:room_snapshots!session_attributions_prev_snapshot_id_fkey(gmv::text)',
        )
        .eq('is_current', true)
        .eq('method', 'SHARED_UNALLOCATED'),
      countUnstaffed(supabase, now),
      supabase
        .from('shift_bookings')
        .select('slot_id', { count: 'exact', head: true })
        .in('status', ['REGISTERED', 'PENDING_APPROVAL']),
    ]);

  fail('đếm ca quá hạn nộp', overdue.error);
  fail('đếm ca cần rà soát', needsReview.error);
  fail('đếm đoạn chưa rõ ownership', unknownOwnership.error);
  fail('đếm sự kiện chờ hậu kiểm', pendingEvents.error);
  fail('đọc đoạn chưa quy kết', unallocated.error);
  fail('đếm đăng ký chờ duyệt', pendingBookings.error);

  const shared = sumUnallocated(
    ((unallocated.data ?? []) as unknown as RawUnallocated[]).map(toUnallocatedRow),
  );

  return [
    { key: 'DATA_OVERDUE', count: overdue.count ?? 0, amount: null },
    { key: 'NEEDS_REVIEW', count: needsReview.count ?? 0, amount: null },
    { key: 'OWNERSHIP_UNKNOWN', count: unknownOwnership.count ?? 0, amount: null },
    { key: 'UNALLOCATED_GMV', count: shared.count, amount: shared.amount },
    { key: 'EVENTS_PENDING_REVIEW', count: pendingEvents.count ?? 0, amount: null },
    { key: 'UNSTAFFED_SESSIONS', count: unstaffed, amount: null },
    { key: 'BOOKINGS_PENDING', count: pendingBookings.count ?? 0, amount: null },
  ];
}

interface RawUnallocated {
  source_snapshot_id: string | null;
  prev_snapshot_id: string | null;
  source: { gmv: string | null } | { gmv: string | null }[] | null;
  previous: { gmv: string | null } | { gmv: string | null }[] | null;
}

function first<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toUnallocatedRow(row: RawUnallocated): UnallocatedRow {
  return {
    sourceSnapshotId: row.source_snapshot_id,
    prevSnapshotId: row.prev_snapshot_id,
    sourceGmv: first(row.source)?.gmv ?? null,
    prevGmv: first(row.previous)?.gmv ?? null,
  };
}

async function countUnstaffed(supabase: SupabaseClient, now: Date): Promise<number> {
  const { data, error } = await supabase
    .from('live_sessions')
    .select('id,live_session_staff(id)')
    .in('status', ['PLANNING', 'OPEN_FOR_BOOKING', 'PENDING_APPROVAL', 'CONFIRMED', 'READY'])
    .gte('planned_start_at', now.toISOString());
  fail('đếm ca chưa có người', error);

  return (data ?? []).filter((row) => {
    const staff = row.live_session_staff;
    return Array.isArray(staff) ? staff.length === 0 : !staff;
  }).length;
}

/**
 * The stretches waiting for Operation to say whose they were, each with the
 * booked shifts around it — the question is almost always "is this the shift
 * whose hours were typed in wrong?" (docs/06 §B2).
 */
export async function loadUnknownStretches(
  supabase: SupabaseClient,
  limit = 50,
): Promise<UnknownStretch[]> {
  const { data, error } = await supabase
    .from('live_sessions')
    .select(
      'id,brand_id,platform_account_id,session_date,actual_start_at,actual_end_at,planned_start_at,planned_end_at,brands(name)',
    )
    .eq('ownership', 'UNKNOWN')
    .neq('status', 'CANCELLED')
    .order('session_date', { ascending: false })
    .limit(limit);
  fail('đọc đoạn chưa rõ ownership', error);

  const stretches = await Promise.all(
    (data ?? []).map(async (row) => {
      const startAt = new Date(row.actual_start_at ?? row.planned_start_at);
      const endAt = new Date(row.actual_end_at ?? row.planned_end_at);

      const figures = await supabase
        .from('session_attributions')
        .select('gmv::text,orders,room_id,platform_rooms(platform_room_id)')
        .eq('session_id', row.id)
        .eq('is_current', true);
      fail('đọc kết quả đoạn chưa rõ', figures.error);

      const rows = (figures.data ?? []) as unknown as {
        gmv: string | null;
        orders: number | null;
        room_id: string;
        platform_rooms: { platform_room_id: string } | { platform_room_id: string }[] | null;
      }[];

      const gmv = rows.some((item) => item.gmv === null)
        ? null
        : rows.reduce((total, item) => total.plus(new Decimal(item.gmv!)), new Decimal(0));

      return {
        sessionId: row.id,
        brandId: row.brand_id,
        brandName: first(row.brands as { name: string } | { name: string }[] | null)?.name ?? '',
        platformAccountId: row.platform_account_id,
        sessionDate: row.session_date,
        startAt,
        endAt,
        roomIds: rows.map((item) => item.room_id),
        platformRoomIds: rows
          .map((item) => first(item.platform_rooms)?.platform_room_id)
          .filter((value): value is string => Boolean(value)),
        gmv,
        orders: rows.some((item) => item.orders === null)
          ? null
          : rows.reduce((total, item) => total + item.orders!, 0),
        nearbySessions: await loadNearbySessions(supabase, row.platform_account_id, row.id, startAt, endAt),
      } satisfies UnknownStretch;
    }),
  );

  return stretches;
}

async function loadNearbySessions(
  supabase: SupabaseClient,
  platformAccountId: string,
  excludeSessionId: string,
  startAt: Date,
  endAt: Date,
): Promise<NearbySession[]> {
  const windowMs = NEARBY_WINDOW_HOURS * 60 * 60 * 1000;
  const { data, error } = await supabase
    .from('live_sessions')
    .select(
      'id,ownership,status,planned_start_at,planned_end_at,actual_start_at,actual_end_at,live_session_staff(role_in_session,users(full_name))',
    )
    .eq('platform_account_id', platformAccountId)
    .neq('id', excludeSessionId)
    .neq('status', 'CANCELLED')
    .neq('ownership', 'UNKNOWN')
    .gte('planned_start_at', new Date(startAt.getTime() - windowMs).toISOString())
    .lte('planned_start_at', new Date(endAt.getTime() + windowMs).toISOString())
    .order('planned_start_at');
  fail('đọc ca lân cận', error);

  return (data ?? []).map((row) => {
    const staff = (Array.isArray(row.live_session_staff) ? row.live_session_staff : []) as {
      role_in_session: string;
      users: { full_name: string } | { full_name: string }[] | null;
    }[];

    return {
      sessionId: row.id,
      startAt: new Date(row.actual_start_at ?? row.planned_start_at),
      endAt: new Date(row.actual_end_at ?? row.planned_end_at),
      ownership: row.ownership,
      status: row.status,
      hostNames: staff
        .filter((item) => item.role_in_session === 'HOST')
        .map((item) => first(item.users)?.full_name)
        .filter((value): value is string => Boolean(value)),
    };
  });
}
