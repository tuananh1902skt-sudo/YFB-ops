import type { SupabaseClient } from '@supabase/supabase-js';
import { sumUnallocated, type UnallocatedRow } from '../operations/unallocated';
import type { DashboardSessionRow } from './brand-dashboard';

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Shifts in the period, with their results where the engine has produced any.
 *
 * Read as two queries and merged, because a shift with no data yet is exactly
 * what the data-quality panel is counting — and it would be missing from a join
 * on results alone.
 */
export async function loadDashboardRows(
  supabase: SupabaseClient,
  brandId: string,
  from: string,
  to: string,
): Promise<{ rows: DashboardSessionRow[]; unallocatedGmv: ReturnType<typeof sumUnallocated> }> {
  const sessions = await supabase
    .from('live_sessions')
    .select(
      'id,session_date,ownership,status,data_confidence,target_gmv::text,live_session_staff(role_in_session,users(full_name))',
    )
    .eq('brand_id', brandId)
    .neq('status', 'CANCELLED')
    .gte('session_date', from)
    .lte('session_date', to);
  fail('đọc ca trong kỳ', sessions.error);

  const ids = (sessions.data ?? []).map((row) => row.id as string);

  const results = ids.length
    ? await supabase
        .from('session_results')
        .select(
          'session_id,gmv::text,orders,items_sold,customers,views,product_impressions,product_clicks,live_minutes,has_unallocated',
        )
        .in('session_id', ids)
    : { data: [], error: null };
  fail('đọc kết quả ca', results.error);

  const byId = new Map(
    ((results.data ?? []) as Record<string, unknown>[]).map((row) => [row.session_id as string, row]),
  );

  const rows: DashboardSessionRow[] = (sessions.data ?? []).map((row) => {
    const result = byId.get(row.id as string);
    const staff = (Array.isArray(row.live_session_staff) ? row.live_session_staff : []) as {
      role_in_session: string;
      users: { full_name: string } | { full_name: string }[] | null;
    }[];

    const asNumber = (value: unknown): number | null =>
      value === null || value === undefined ? null : Number(value);

    return {
      sessionId: row.id,
      sessionDate: row.session_date,
      ownership: row.ownership,
      confidence: row.data_confidence,
      status: row.status,
      gmv: (result?.gmv as string | null) ?? null,
      orders: asNumber(result?.orders),
      itemsSold: asNumber(result?.items_sold),
      customers: asNumber(result?.customers),
      views: asNumber(result?.views),
      productImpressions: asNumber(result?.product_impressions),
      productClicks: asNumber(result?.product_clicks),
      liveMinutes: asNumber(result?.live_minutes),
      targetGmv: row.target_gmv,
      hasUnallocated: Boolean(result?.has_unallocated),
      hostNames: staff
        .filter((item) => item.role_in_session === 'HOST')
        .map((item) => first(item.users)?.full_name)
        .filter((value): value is string => Boolean(value)),
    };
  });

  const unallocated = ids.length
    ? await supabase
        .from('session_attributions')
        .select(
          'source_snapshot_id,prev_snapshot_id,source:room_snapshots!session_attributions_source_snapshot_id_fkey(gmv::text),previous:room_snapshots!session_attributions_prev_snapshot_id_fkey(gmv::text)',
        )
        .in('session_id', ids)
        .eq('is_current', true)
        .eq('method', 'SHARED_UNALLOCATED')
    : { data: [], error: null };
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

  return { rows, unallocatedGmv: sumUnallocated(unallocatedRows) };
}
