import type { SupabaseClient } from '@supabase/supabase-js';
import { Decimal } from 'decimal.js';
import { sumUnallocated, type UnallocatedRow } from '../operations/unallocated';
import { platformToday } from '../planning/schedule-view';
import { buildCommandCenter, type CommandCenterSession } from './build';
import type { CommandCenter } from './types';

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Tất cả đi qua client của người đăng nhập, nên RLS quyết định họ thấy brand nào —
 * màn hình không tự lọc lấy, và cũng không cần biết họ thuộc brand nào.
 */
export async function loadCommandCenter(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<CommandCenter> {
  const today = platformToday(now);

  const sessions = await supabase
    .from('live_sessions')
    .select(
      'id,status,ownership,planned_start_at,planned_end_at,actual_start_at,actual_end_at,target_gmv::text,brands(name),live_session_staff(users(full_name))',
    )
    .eq('session_date', today);
  fail('đọc ca hôm nay', sessions.error);

  const ids = (sessions.data ?? []).map((row) => row.id as string);
  const results = ids.length
    ? await supabase.from('session_results').select('session_id,gmv::text').in('session_id', ids)
    : { data: [], error: null };
  fail('đọc kết quả ca', results.error);

  const gmvById = new Map(
    ((results.data ?? []) as Record<string, unknown>[]).map((row) => [
      row.session_id as string,
      (row.gmv as string | null) ?? null,
    ]),
  );

  const rows: CommandCenterSession[] = (sessions.data ?? []).map((row) => {
    const staff = (Array.isArray(row.live_session_staff) ? row.live_session_staff : []) as {
      users: { full_name: string } | { full_name: string }[] | null;
    }[];
    const startAt = (row.actual_start_at ?? row.planned_start_at) as string | null;
    const endAt = (row.actual_end_at ?? row.planned_end_at) as string | null;

    return {
      sessionId: row.id as string,
      brandName: first(row.brands as { name: string } | { name: string }[] | null)?.name ?? '—',
      startAt: startAt ? new Date(startAt) : null,
      endAt: endAt ? new Date(endAt) : null,
      staffNames: staff
        .map((item) => first(item.users)?.full_name)
        .filter((value): value is string => Boolean(value)),
      status: row.status as string,
      ownership: row.ownership,
      gmv: gmvById.get(row.id as string) ?? null,
      targetGmv: (row.target_gmv as string | null) ?? null,
    };
  });

  // Các con số đếm chạy trên toàn bộ dữ liệu người này thấy được, không giới hạn
  // hôm nay: một ca tuần trước chưa nộp report vẫn là việc đang chặn số liệu.
  const [unknown, awaiting, pending, openSlots, unallocated] = await Promise.all([
    supabase.from('live_sessions').select('id', { count: 'exact', head: true }).eq('ownership', 'UNKNOWN'),
    supabase
      .from('live_sessions')
      .select('id', { count: 'exact', head: true })
      .in('status', ['DATA_PENDING', 'DATA_PARTIAL']),
    supabase
      .from('shift_bookings')
      .select('id', { count: 'exact', head: true })
      .in('status', ['REGISTERED', 'PENDING_APPROVAL']),
    supabase
      .from('shift_slots')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'OPEN')
      .gte('start_at', now.toISOString()),
    supabase
      .from('session_attributions')
      .select(
        'source_snapshot_id,prev_snapshot_id,source:room_snapshots!session_attributions_source_snapshot_id_fkey(gmv::text),previous:room_snapshots!session_attributions_prev_snapshot_id_fkey(gmv::text)',
      )
      .eq('is_current', true)
      .eq('method', 'SHARED_UNALLOCATED'),
  ]);
  fail('đếm ca chưa rõ ownership', unknown.error);
  fail('đếm ca chờ dữ liệu', awaiting.error);
  fail('đếm đăng ký chờ duyệt', pending.error);
  fail('đếm ca đang mở', openSlots.error);
  fail('đọc đoạn chưa quy kết', unallocated.error);

  const unallocatedRows: UnallocatedRow[] = (
    (unallocated.data ?? []) as unknown as {
      source_snapshot_id: string | null;
      prev_snapshot_id: string | null;
      source: { gmv: string | null } | { gmv: string | null }[] | null;
      previous: { gmv: string | null } | { gmv: string | null }[] | null;
    }[]
  ).map((row) => ({
    sourceSnapshotId: row.source_snapshot_id,
    prevSnapshotId: row.prev_snapshot_id,
    sourceGmv: first(row.source)?.gmv ?? null,
    prevGmv: first(row.previous)?.gmv ?? null,
  }));

  return buildCommandCenter({
    today,
    now,
    sessions: rows,
    counts: {
      unknownOwnership: unknown.count ?? 0,
      awaitingData: awaiting.count ?? 0,
      pendingBookings: pending.count ?? 0,
      unstaffedSlots: openSlots.count ?? 0,
    },
    unallocatedGmv: sumUnallocated(unallocatedRows).amount ?? new Decimal(0),
  });
}
