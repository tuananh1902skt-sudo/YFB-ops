import type { SupabaseClient } from '@supabase/supabase-js';
import { Decimal } from 'decimal.js';
import type { AttributionDraft } from '../attribution/types';
import { METRIC_SELECT, metricsFromRow, metricsToColumns } from '../ingest/metric-columns';
import type {
  AdsDailyRecord,
  AuditEntry,
  DiscoveredSessionInput,
  ExistingImport,
  ImportContext,
  IngestRepository,
  NewSnapshot,
  RawRowInput,
  RoomRecord,
  SessionDataState,
  SessionRecord,
  SnapshotRecord,
} from '../ingest/types';

interface Clients {
  /** Signed-in person: everything they are allowed to write goes through RLS. */
  user: SupabaseClient;
  /** Derived figures only — the attribution engine's own writes. */
  service: SupabaseClient;
}

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

/**
 * Supabase types a select from its literal string, which it cannot do for the
 * column list built from METRIC_COLUMNS. The rows are handed to a mapper that
 * names every field it reads, so the shape is still checked — just one step later.
 */
async function rowsOf(
  query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  context: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await query;
  fail(context, error);
  return (data ?? []) as Record<string, unknown>[];
}

export function createIngestRepository({ user, service }: Clients): IngestRepository {
  return {
    async getSettings() {
      const { data, error } = await user.from('system_settings').select('key,value');
      fail('đọc system_settings', error);
      return Object.fromEntries((data ?? []).map((row) => [row.key as string, row.value]));
    },

    async findImportByHash(platformAccountId, fileHash): Promise<ExistingImport | null> {
      const { data, error } = await user
        .from('raw_imports')
        .select('id,file_name,uploaded_at')
        .eq('platform_account_id', platformAccountId)
        .eq('file_hash', fileHash)
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      fail('tìm import trùng', error);
      return data
        ? { id: data.id, fileName: data.file_name, uploadedAt: new Date(data.uploaded_at) }
        : null;
    },

    async createImport(input) {
      const context: ImportContext = input.context;
      const { data, error } = await user
        .from('raw_imports')
        .insert({
          import_type: input.importType,
          platform_account_id: context.platformAccountId,
          file_name: context.fileName,
          file_hash: context.fileHash,
          storage_path: context.storagePath,
          data_period_start: input.dataPeriodStart,
          data_period_end: input.dataPeriodEnd,
          row_count: input.rowCount,
          uploaded_by: context.uploadedBy,
        })
        .select('id')
        .single();
      fail('tạo raw_imports', error);
      return data!.id as string;
    },

    async finishImport(importId, patch) {
      const { error } = await user
        .from('raw_imports')
        .update({ status: patch.status, error_summary: patch.errorSummary })
        .eq('id', importId);
      fail('cập nhật trạng thái import', error);
    },

    async insertRawRows(importId, rows: RawRowInput[]) {
      const { data, error } = await user
        .from('raw_import_rows')
        .insert(
          rows.map((row) => ({
            import_id: importId,
            row_index: row.rowIndex,
            raw_values: row.rawValues,
            parse_error: row.parseError,
          })),
        )
        .select('id,row_index');
      fail('ghi raw_import_rows', error);
      return new Map((data ?? []).map((row) => [row.row_index as number, String(row.id)]));
    },

    async findOrCreateRoom(input) {
      const match = {
        platform_account_id: input.platformAccountId,
        platform_room_id: input.platformRoomId,
        room_start_at: input.roomStartAt.toISOString(),
      };

      const existing = await user
        .from('platform_rooms')
        .select('id,platform_room_id,room_start_at,room_title')
        .match(match)
        .maybeSingle();
      fail('tìm platform_rooms', existing.error);
      if (existing.data) return toRoom(existing.data);

      const created = await user
        .from('platform_rooms')
        .insert({ ...match, room_title: input.roomTitle })
        .select('id,platform_room_id,room_start_at,room_title')
        .single();

      // Another upload of the same room may have landed first; the unique key
      // decides, and both uploads end up pointing at the same room.
      if (created.error) {
        const retry = await user
          .from('platform_rooms')
          .select('id,platform_room_id,room_start_at,room_title')
          .match(match)
          .single();
        fail('tạo platform_rooms', retry.error);
        return toRoom(retry.data!);
      }
      return toRoom(created.data);
    },

    async listRoomsInWindow(platformAccountId, from, to) {
      const started = await user
        .from('platform_rooms')
        .select('id,platform_room_id,room_start_at,room_title')
        .eq('platform_account_id', platformAccountId)
        .gte('room_start_at', from.toISOString())
        .lte('room_start_at', to.toISOString());
      fail('đọc platform_rooms theo khoảng thời gian', started.error);

      // A room that began before the window still belongs to it if a snapshot
      // inside the window measured it.
      const snapshots = await user
        .from('room_snapshots')
        .select('room_id,platform_rooms!inner(platform_account_id)')
        .eq('platform_rooms.platform_account_id', platformAccountId)
        .gte('snapshot_end_at', from.toISOString())
        .lte('snapshot_end_at', to.toISOString());
      fail('đọc room_snapshots theo khoảng thời gian', snapshots.error);

      const known = new Set((started.data ?? []).map((row) => row.id as string));
      const missing = [
        ...new Set((snapshots.data ?? []).map((row) => row.room_id as string)),
      ].filter((id) => !known.has(id));

      const rooms = (started.data ?? []).map(toRoom);
      if (missing.length > 0) {
        const extra = await user
          .from('platform_rooms')
          .select('id,platform_room_id,room_start_at,room_title')
          .in('id', missing);
        fail('đọc platform_rooms bổ sung', extra.error);
        rooms.push(...(extra.data ?? []).map(toRoom));
      }
      return rooms;
    },

    async listSnapshots(roomIds) {
      if (roomIds.length === 0) return [];
      const data = await rowsOf(
        user
          .from('room_snapshots')
          .select(`id,room_id,snapshot_end_at,${METRIC_SELECT}`)
          .in('room_id', roomIds)
          .order('snapshot_end_at', { ascending: true }),
        'đọc room_snapshots',
      );
      return data.map(toSnapshot);
    },

    async insertSnapshots(snapshots: NewSnapshot[]) {
      if (snapshots.length === 0) return [];
      const data = await rowsOf(
        user
          .from('room_snapshots')
          .insert(
            snapshots.map((snapshot) => ({
              room_id: snapshot.roomId,
              raw_import_row_id: snapshot.rawImportRowId,
              snapshot_end_at: snapshot.snapshotEndAt.toISOString(),
              duration_minutes: snapshot.durationMinutes,
              reported_derived: snapshot.reportedDerived,
              ...metricsToColumns(snapshot.metrics),
            })),
          )
          .select(`id,room_id,snapshot_end_at,${METRIC_SELECT}`),
        'ghi room_snapshots',
      );
      return data.map(toSnapshot);
    },

    async listSessionsInWindow(platformAccountId, from, to) {
      const { data, error } = await user
        .from('live_sessions')
        .select(
          'id,brand_id,ownership,planned_start_at,planned_end_at,actual_start_at,actual_end_at',
        )
        .eq('platform_account_id', platformAccountId)
        .neq('status', 'CANCELLED')
        .lt('planned_start_at', to.toISOString())
        .gt('planned_end_at', from.toISOString());
      fail('đọc live_sessions', error);

      return (data ?? [])
        .map((row): SessionRecord | null => {
          // Actual times win where they exist: achievement is measured against
          // what happened, not what was planned (docs/01 §4).
          const startAt = row.actual_start_at ?? row.planned_start_at;
          const endAt = row.actual_end_at ?? row.planned_end_at;
          if (!startAt || !endAt) return null;
          return {
            id: row.id,
            brandId: row.brand_id,
            ownership: row.ownership,
            startAt: new Date(startAt),
            endAt: new Date(endAt),
          };
        })
        .filter((session): session is SessionRecord => session !== null);
    },

    async createDiscoveredSession(input: DiscoveredSessionInput) {
      const account = await service
        .from('platform_accounts')
        .select('brand_id')
        .eq('id', input.platformAccountId)
        .single();
      fail('đọc platform_accounts', account.error);

      const { data, error } = await service
        .from('live_sessions')
        .insert({
          brand_id: account.data!.brand_id,
          platform_account_id: input.platformAccountId,
          session_date: input.sessionDate,
          actual_start_at: input.startAt.toISOString(),
          actual_end_at: input.endAt.toISOString(),
          ownership: 'UNKNOWN',
          status: 'DATA_PARTIAL',
          note: input.note,
        })
        .select('id,brand_id,ownership,actual_start_at,actual_end_at')
        .single();
      fail('tạo ca UNKNOWN', error);

      return {
        id: data!.id,
        brandId: data!.brand_id,
        ownership: 'UNKNOWN',
        startAt: new Date(data!.actual_start_at),
        endAt: new Date(data!.actual_end_at),
      };
    },

    async supersedeAttributions(sessionIds) {
      if (sessionIds.length === 0) return;
      const { error } = await service
        .from('session_attributions')
        .update({ is_current: false })
        .in('session_id', sessionIds)
        .eq('is_current', true);
      fail('đánh dấu attribution cũ', error);
    },

    async insertAttributions(drafts: AttributionDraft[]) {
      if (drafts.length === 0) return;
      const { error } = await service.from('session_attributions').insert(
        drafts.map((draft) => ({
          session_id: draft.sessionId,
          room_id: draft.roomId,
          method: draft.method,
          source_snapshot_id: draft.sourceSnapshotId,
          prev_snapshot_id: draft.prevSnapshotId,
          segment_start_at: draft.segmentStartAt?.toISOString() ?? null,
          segment_end_at: draft.segmentEndAt?.toISOString() ?? null,
          duration_minutes: draft.durationMinutes,
          confidence: draft.confidence,
          computed_reason:
            draft.computedReason ??
            (draft.issues.length > 0 ? `Cảnh báo: ${draft.issues.join(', ')}` : null),
          ...metricsToColumns(draft.metrics),
        })),
      );
      fail('ghi session_attributions', error);
    },

    async updateSessionDataState(states: SessionDataState[]) {
      for (const state of states) {
        const { error } = await service
          .from('live_sessions')
          .update({ status: state.status, data_confidence: state.dataConfidence })
          .eq('id', state.sessionId)
          .in('status', ['LIVE', 'READY', 'DATA_PENDING', 'DATA_PARTIAL', 'DATA_COMPLETE']);
        fail('cập nhật trạng thái ca', error);
      }
    },

    async findAdsDaily(platformAccountId, statDates) {
      if (statDates.length === 0) return [];
      const { data, error } = await user
        .from('ads_daily')
        .select('stat_date,ads_spend::text,ads_sku_orders,ads_gross_revenue::text,currency')
        .eq('platform_account_id', platformAccountId)
        .in('stat_date', statDates);
      fail('đọc ads_daily', error);

      return (data ?? []).map(
        (row): AdsDailyRecord => ({
          statDate: row.stat_date,
          adsSpend: new Decimal(String(row.ads_spend)),
          adsSkuOrders: row.ads_sku_orders,
          adsGrossRevenue:
            row.ads_gross_revenue === null ? null : new Decimal(String(row.ads_gross_revenue)),
          currency: row.currency,
        }),
      );
    },

    async upsertAdsDaily(platformAccountId, importId, rows: AdsDailyRecord[]) {
      if (rows.length === 0) return;
      const { error } = await user.from('ads_daily').upsert(
        rows.map((row) => ({
          platform_account_id: platformAccountId,
          stat_date: row.statDate,
          ads_spend: row.adsSpend.toFixed(2),
          ads_sku_orders: row.adsSkuOrders,
          ads_gross_revenue: row.adsGrossRevenue?.toFixed(2) ?? null,
          currency: row.currency,
          import_id: importId,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'platform_account_id,stat_date' },
      );
      fail('ghi ads_daily', error);
    },

    async writeAuditLogs(entries: AuditEntry[]) {
      if (entries.length === 0) return;
      const { error } = await user.from('audit_logs').insert(
        entries.map((entry) => ({
          entity_type: entry.entityType,
          entity_id: entry.entityId,
          action: entry.action,
          before_data: entry.beforeData,
          after_data: entry.afterData,
          reason: entry.reason,
          actor_id: entry.actorId,
        })),
      );
      fail('ghi audit_logs', error);
    },
  };
}

function toRoom(row: Record<string, unknown>): RoomRecord {
  return {
    id: String(row.id),
    platformRoomId: String(row.platform_room_id),
    roomStartAt: new Date(String(row.room_start_at)),
    roomTitle: (row.room_title as string | null) ?? null,
  };
}

function toSnapshot(row: Record<string, unknown>): SnapshotRecord {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    snapshotEndAt: new Date(String(row.snapshot_end_at)),
    metrics: metricsFromRow(row),
  };
}
