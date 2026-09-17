import type { AttributionDraft } from '../attribution/types';
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
} from './types';

interface StoredImport {
  id: string;
  context: ImportContext;
  status: string;
  errorSummary: unknown;
  uploadedAt?: Date;
}

interface StoredAttribution extends AttributionDraft {
  isCurrent: boolean;
}

export interface MemorySession extends SessionRecord {
  discovered: boolean;
  platformAccountId: string;
  status: string;
}

/**
 * An in-memory store that repeats the constraints the migrations declare: a
 * rule the pipeline breaks here would be rejected by the database too.
 *
 * Used by the tests, and by `scripts/dry-run-import.ts` to run a real export
 * through the whole pipeline without touching anyone's data.
 */
export class MemoryRepository implements IngestRepository {
  settings: Record<string, unknown> = {
    room_continuity_max_gap_hours: 8,
    segment_match_min_overlap_minutes: 2,
    segment_match_min_overlap_ratio: 0.1,
  };

  imports: StoredImport[] = [];
  rawRows: { id: string; importId: string; row: RawRowInput }[] = [];
  rooms: RoomRecord[] = [];
  snapshots: SnapshotRecord[] = [];
  sessions: MemorySession[] = [];
  attributions: StoredAttribution[] = [];
  sessionStates = new Map<string, SessionDataState>();
  ads: (AdsDailyRecord & { platformAccountId: string; importId: string })[] = [];
  auditLogs: AuditEntry[] = [];

  private sequence = 0;

  /**
   * A namespace keeps generated ids from colliding with ids seeded from another
   * store — which would silently make one record look like another.
   */
  constructor(private readonly namespace = '') {}

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${this.namespace}${prefix}-${this.sequence}`;
  }

  /**
   * Loads a slice of real data so the pipeline can be run over it without
   * writing anything back — see `preview.ts`.
   */
  seed(data: {
    settings?: Record<string, unknown>;
    platformAccountId?: string;
    rooms?: RoomRecord[];
    snapshots?: SnapshotRecord[];
    sessions?: SessionRecord[];
    imports?: { platformAccountId: string; fileHash: string; fileName: string; uploadedAt: Date }[];
  }): void {
    if (data.settings) this.settings = data.settings;
    this.rooms.push(...(data.rooms ?? []));
    this.snapshots.push(...(data.snapshots ?? []));
    this.sessions.push(
      ...(data.sessions ?? []).map((session) => ({
        ...session,
        discovered: false,
        platformAccountId: data.platformAccountId ?? '',
        status: 'CONFIRMED',
      })),
    );

    for (const item of data.imports ?? []) {
      this.imports.push({
        id: this.nextId('seeded-import'),
        context: {
          platformAccountId: item.platformAccountId,
          uploadedBy: 'unknown',
          fileName: item.fileName,
          fileHash: item.fileHash,
          storagePath: '',
        },
        status: 'MATCHED',
        errorSummary: null,
        uploadedAt: item.uploadedAt,
      });
    }
  }

  addSession(
    session: Omit<SessionRecord, 'ownership'> & {
      ownership?: SessionRecord['ownership'];
      platformAccountId?: string;
      status?: string;
    },
  ): MemorySession {
    const record: MemorySession = {
      ...session,
      ownership: session.ownership ?? 'AGENCY',
      discovered: false,
      platformAccountId: session.platformAccountId ?? '',
      status: session.status ?? 'CONFIRMED',
    };
    this.sessions.push(record);
    return record;
  }

  async getSettings(): Promise<Record<string, unknown>> {
    return this.settings;
  }

  async findImportByHash(platformAccountId: string, fileHash: string): Promise<ExistingImport | null> {
    const found = this.imports.find(
      (item) =>
        item.context.platformAccountId === platformAccountId && item.context.fileHash === fileHash,
    );
    return found
      ? { id: found.id, fileName: found.context.fileName, uploadedAt: found.uploadedAt ?? new Date(0) }
      : null;
  }

  async createImport(input: { context: ImportContext }): Promise<string> {
    const id = this.nextId('import');
    this.imports.push({ id, context: input.context, status: 'UPLOADED', errorSummary: null });
    return id;
  }

  async finishImport(importId: string, patch: { status: string; errorSummary: unknown }): Promise<void> {
    const found = this.imports.find((item) => item.id === importId)!;
    found.status = patch.status;
    found.errorSummary = patch.errorSummary;
  }

  async insertRawRows(importId: string, rows: RawRowInput[]): Promise<Map<number, string>> {
    const ids = new Map<number, string>();
    for (const row of rows) {
      const id = this.nextId('raw');
      this.rawRows.push({ id, importId, row });
      ids.set(row.rowIndex, id);
    }
    return ids;
  }

  async findOrCreateRoom(input: {
    platformAccountId: string;
    platformRoomId: string;
    roomStartAt: Date;
    roomTitle: string | null;
  }): Promise<RoomRecord> {
    if (!/^\d+$/.test(input.platformRoomId)) {
      throw new Error(`platform_room_id_digits: ${input.platformRoomId}`);
    }
    const existing = this.rooms.find(
      (room) =>
        room.platformRoomId === input.platformRoomId &&
        room.roomStartAt.getTime() === input.roomStartAt.getTime(),
    );
    if (existing) return existing;

    const room: RoomRecord = {
      id: this.nextId('room'),
      platformRoomId: input.platformRoomId,
      roomStartAt: input.roomStartAt,
      roomTitle: input.roomTitle,
    };
    this.rooms.push(room);
    return room;
  }

  async listRoomsInWindow(_accountId: string, from: Date, to: Date): Promise<RoomRecord[]> {
    return this.rooms.filter((room) => {
      if (room.roomStartAt >= from && room.roomStartAt <= to) return true;
      return this.snapshots.some(
        (snapshot) =>
          snapshot.roomId === room.id && snapshot.snapshotEndAt >= from && snapshot.snapshotEndAt <= to,
      );
    });
  }

  async listSnapshots(roomIds: string[]): Promise<SnapshotRecord[]> {
    return this.snapshots
      .filter((snapshot) => roomIds.includes(snapshot.roomId))
      .sort((a, b) => a.snapshotEndAt.getTime() - b.snapshotEndAt.getTime());
  }

  async insertSnapshots(snapshots: NewSnapshot[]): Promise<SnapshotRecord[]> {
    const created: SnapshotRecord[] = [];
    for (const snapshot of snapshots) {
      const clash = this.snapshots.some(
        (stored) =>
          stored.roomId === snapshot.roomId &&
          stored.snapshotEndAt.getTime() === snapshot.snapshotEndAt.getTime(),
      );
      if (clash) throw new Error('room_snapshots_room_id_snapshot_end_at_key');

      const record: SnapshotRecord = {
        id: this.nextId('snapshot'),
        roomId: snapshot.roomId,
        snapshotEndAt: snapshot.snapshotEndAt,
        metrics: snapshot.metrics,
      };
      this.snapshots.push(record);
      created.push(record);
    }
    return created;
  }

  async listSessionsInWindow(_accountId: string, from: Date, to: Date): Promise<SessionRecord[]> {
    // Cancelled shifts never match a stretch of room time, exactly as the
    // Supabase query does — otherwise a merged-away placeholder would keep
    // claiming its old figures.
    return this.sessions.filter(
      (session) => session.status !== 'CANCELLED' && session.startAt < to && session.endAt > from,
    );
  }

  async createDiscoveredSession(input: DiscoveredSessionInput): Promise<SessionRecord> {
    const session: MemorySession = {
      id: this.nextId('session'),
      brandId: 'brand-1',
      ownership: 'UNKNOWN',
      startAt: input.startAt,
      endAt: input.endAt,
      discovered: true,
      platformAccountId: input.platformAccountId,
      status: 'DATA_PARTIAL',
    };
    this.sessions.push(session);
    return session;
  }

  async supersedeAttributions(sessionIds: string[]): Promise<void> {
    for (const attribution of this.attributions) {
      if (sessionIds.includes(attribution.sessionId)) attribution.isCurrent = false;
    }
  }

  async insertAttributions(drafts: AttributionDraft[]): Promise<void> {
    for (const draft of drafts) {
      const gmv = draft.metrics.gmv;
      if (gmv && gmv.isNegative()) throw new Error('no_negative_gmv');
      if (draft.metrics.orders !== null && draft.metrics.orders < 0) {
        throw new Error('no_negative_orders');
      }
      if (draft.method === 'SHARED_UNALLOCATED' && (gmv !== null || draft.metrics.orders !== null)) {
        throw new Error('shared_has_no_figures');
      }
      const clash = this.attributions.some(
        (stored) =>
          stored.isCurrent &&
          stored.sessionId === draft.sessionId &&
          stored.roomId === draft.roomId,
      );
      if (clash) throw new Error('session_attributions_one_per_room_idx');

      this.attributions.push({ ...draft, isCurrent: true });
    }
  }

  async updateSessionDataState(states: SessionDataState[]): Promise<void> {
    for (const state of states) this.sessionStates.set(state.sessionId, state);
  }

  async findAdsDaily(platformAccountId: string, statDates: string[]): Promise<AdsDailyRecord[]> {
    return this.ads.filter(
      (row) => row.platformAccountId === platformAccountId && statDates.includes(row.statDate),
    );
  }

  async upsertAdsDaily(
    platformAccountId: string,
    importId: string,
    rows: AdsDailyRecord[],
  ): Promise<void> {
    for (const row of rows) {
      const index = this.ads.findIndex(
        (stored) => stored.platformAccountId === platformAccountId && stored.statDate === row.statDate,
      );
      const record = { ...row, platformAccountId, importId };
      if (index >= 0) this.ads[index] = record;
      else this.ads.push(record);
    }
  }

  async writeAuditLogs(entries: AuditEntry[]): Promise<void> {
    this.auditLogs.push(...entries);
  }

  currentFor(sessionId: string): StoredAttribution[] {
    return this.attributions.filter((row) => row.isCurrent && row.sessionId === sessionId);
  }
}
