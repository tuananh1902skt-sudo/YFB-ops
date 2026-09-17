import type { Decimal } from 'decimal.js';
import type { CumulativeMetrics } from '../parsing/live-performance';
import type { AttributionDraft, DataConfidence, SessionOwnership } from '../attribution/types';

/** Who uploaded what. Every stored figure traces back to one of these. */
export interface ImportContext {
  platformAccountId: string;
  uploadedBy: string;
  fileName: string;
  fileHash: string;
  storagePath: string;
}

export interface ExistingImport {
  id: string;
  fileName: string;
  uploadedAt: Date;
}

export interface RoomRecord {
  id: string;
  platformRoomId: string;
  roomStartAt: Date;
  roomTitle: string | null;
}

export interface SnapshotRecord {
  id: string;
  roomId: string;
  snapshotEndAt: Date;
  metrics: CumulativeMetrics;
}

export interface SessionRecord {
  id: string;
  brandId: string;
  ownership: SessionOwnership;
  /** Actual times when logged, planned times otherwise (docs/01 §4). */
  startAt: Date;
  endAt: Date;
}

export interface RawRowInput {
  rowIndex: number;
  rawValues: Record<string, string | null>;
  parseError: string | null;
}

export interface NewSnapshot {
  roomId: string;
  rawImportRowId: string;
  snapshotEndAt: Date;
  /** The export's own Duration column: whole room, not this shift. Stored as reported. */
  durationMinutes: number | null;
  metrics: CumulativeMetrics;
  reportedDerived: Record<string, number | null>;
}

export interface DiscoveredSessionInput {
  platformAccountId: string;
  /** Day the stretch began in GMT+7 — computed in code, never by the database. */
  sessionDate: string;
  startAt: Date;
  endAt: Date;
  note: string;
}

export interface SessionDataState {
  sessionId: string;
  status: 'DATA_PENDING' | 'DATA_PARTIAL' | 'DATA_COMPLETE';
  dataConfidence: DataConfidence | null;
}

export interface AuditEntry {
  entityType: string;
  entityId: string;
  action: string;
  beforeData: unknown;
  afterData: unknown;
  reason: string | null;
  actorId: string | null;
}

export interface AdsDailyRecord {
  statDate: string;
  adsSpend: Decimal;
  adsSkuOrders: number | null;
  adsGrossRevenue: Decimal | null;
  currency: string;
}

/**
 * Everything the import pipeline needs from storage. Declared as a port so the
 * attribution rules can be tested end-to-end without a database — the rules are
 * the part that must not drift, and they are not Supabase's to define.
 */
export interface IngestRepository {
  getSettings(): Promise<Record<string, unknown>>;

  findImportByHash(platformAccountId: string, fileHash: string): Promise<ExistingImport | null>;
  createImport(input: {
    context: ImportContext;
    importType: 'LIVE_PERFORMANCE' | 'ADS_DAILY';
    dataPeriodStart: string | null;
    dataPeriodEnd: string | null;
    rowCount: number;
  }): Promise<string>;
  finishImport(importId: string, patch: {
    status: 'PARSED' | 'VALIDATED' | 'MATCHED' | 'PARTIALLY_MATCHED' | 'NEEDS_REVIEW' | 'FAILED';
    errorSummary: unknown;
  }): Promise<void>;
  /** Returns the stored row ids keyed by the row's index in the sheet. */
  insertRawRows(importId: string, rows: RawRowInput[]): Promise<Map<number, string>>;

  findOrCreateRoom(input: {
    platformAccountId: string;
    platformRoomId: string;
    roomStartAt: Date;
    roomTitle: string | null;
  }): Promise<RoomRecord>;
  /** Rooms that started in the window or have a snapshot inside it. */
  listRoomsInWindow(platformAccountId: string, from: Date, to: Date): Promise<RoomRecord[]>;
  listSnapshots(roomIds: string[]): Promise<SnapshotRecord[]>;
  insertSnapshots(snapshots: NewSnapshot[]): Promise<SnapshotRecord[]>;

  listSessionsInWindow(platformAccountId: string, from: Date, to: Date): Promise<SessionRecord[]>;
  createDiscoveredSession(input: DiscoveredSessionInput): Promise<SessionRecord>;

  /** Marks the shift's current rows superseded; they stay for the audit trail. */
  supersedeAttributions(sessionIds: string[]): Promise<void>;
  insertAttributions(drafts: AttributionDraft[]): Promise<void>;
  updateSessionDataState(states: SessionDataState[]): Promise<void>;

  findAdsDaily(platformAccountId: string, statDates: string[]): Promise<AdsDailyRecord[]>;
  upsertAdsDaily(
    platformAccountId: string,
    importId: string,
    rows: AdsDailyRecord[],
  ): Promise<void>;

  writeAuditLogs(entries: AuditEntry[]): Promise<void>;
}
