import type { LiveParseResult, LiveSnapshotRow } from '../parsing/live-performance';
import { recomputeWindow, type RecomputeResult } from './recompute';
import type {
  ExistingImport,
  ImportContext,
  IngestRepository,
  NewSnapshot,
  RawRowInput,
  RoomRecord,
} from './types';

export interface SkippedSnapshot {
  platformRoomId: string;
  snapshotEndAt: Date;
  reason: 'ALREADY_IMPORTED' | 'DUPLICATE_IN_FILE';
}

export type LiveImportReport =
  /** The same file, uploaded again. Nothing is stored twice, nothing is lost. */
  | { status: 'DUPLICATE_FILE'; existingImport: ExistingImport }
  | {
      status: 'NEEDS_MAPPING';
      importId: string;
      headerSignature: string;
      missingColumns: string[];
      unexpectedColumns: string[];
    }
  | {
      status: 'IMPORTED';
      importId: string;
      rowsParsed: number;
      failedRows: { rowIndex: number; reason: string }[];
      rooms: { platformRoomId: string; roomId: string }[];
      snapshotsCreated: number;
      skippedSnapshots: SkippedSnapshot[];
      attribution: RecomputeResult | null;
    };

function snapshotKey(roomId: string, endAt: Date): string {
  return `${roomId}|${endAt.getTime()}`;
}

/**
 * Stores one uploaded live report and re-derives every shift it touches.
 *
 * The figures in the file are cumulative from the room's start, so nothing here
 * adds anything up: rows are recorded as received, and the shift split is
 * recomputed from the full set of snapshots afterwards.
 */
export async function importLivePerformance(
  repo: IngestRepository,
  context: ImportContext,
  parsed: LiveParseResult,
): Promise<LiveImportReport> {
  const existing = await repo.findImportByHash(context.platformAccountId, context.fileHash);
  if (existing) {
    return { status: 'DUPLICATE_FILE', existingImport: existing };
  }

  if (parsed.status === 'NEEDS_MAPPING') {
    // An unrecognised layout is never guessed at; the upload is kept so the
    // person who sent it can be told exactly which columns did not match.
    const importId = await repo.createImport({
      context,
      importType: 'LIVE_PERFORMANCE',
      dataPeriodStart: null,
      dataPeriodEnd: null,
      rowCount: 0,
    });
    await repo.finishImport(importId, {
      status: 'NEEDS_REVIEW',
      errorSummary: {
        reason: 'HEADER_UNKNOWN',
        missingColumns: parsed.missingColumns,
        unexpectedColumns: parsed.unexpectedColumns,
      },
    });
    return {
      status: 'NEEDS_MAPPING',
      importId,
      headerSignature: parsed.headerSignature,
      missingColumns: parsed.missingColumns,
      unexpectedColumns: parsed.unexpectedColumns,
    };
  }

  const importId = await repo.createImport({
    context,
    importType: 'LIVE_PERFORMANCE',
    dataPeriodStart: parsed.dataPeriod?.start ?? null,
    dataPeriodEnd: parsed.dataPeriod?.end ?? null,
    rowCount: parsed.rows.length + parsed.failedRows.length,
  });

  const rawRows: RawRowInput[] = [
    ...parsed.rows.map((row) => ({
      rowIndex: row.rowIndex,
      rawValues: row.rawValues,
      parseError: null,
    })),
    ...parsed.failedRows.map((row) => ({
      rowIndex: row.rowIndex,
      rawValues: row.rawValues,
      parseError: row.reason,
    })),
  ].sort((a, b) => a.rowIndex - b.rowIndex);
  const rawRowIds = await repo.insertRawRows(importId, rawRows);

  const rooms = new Map<string, RoomRecord>();
  for (const row of parsed.rows) {
    const key = `${row.platformRoomId}|${row.roomStartAt.getTime()}`;
    if (rooms.has(key)) continue;
    rooms.set(
      key,
      await repo.findOrCreateRoom({
        platformAccountId: context.platformAccountId,
        platformRoomId: row.platformRoomId,
        roomStartAt: row.roomStartAt,
        roomTitle: row.roomTitle,
      }),
    );
  }

  const known = new Set(
    (await repo.listSnapshots([...rooms.values()].map((room) => room.id))).map((snapshot) =>
      snapshotKey(snapshot.roomId, snapshot.snapshotEndAt),
    ),
  );

  const toInsert: NewSnapshot[] = [];
  const skipped: SkippedSnapshot[] = [];
  const seenInFile = new Set<string>();

  for (const row of parsed.rows) {
    const room = rooms.get(`${row.platformRoomId}|${row.roomStartAt.getTime()}`)!;
    const key = snapshotKey(room.id, row.snapshotEndAt);

    // One room may legitimately appear in several files — a per-shift upload
    // and a monthly bulk export both contain it. The same moment in time is
    // the same measurement, so it is stored once.
    if (known.has(key)) {
      skipped.push({
        platformRoomId: row.platformRoomId,
        snapshotEndAt: row.snapshotEndAt,
        reason: 'ALREADY_IMPORTED',
      });
      continue;
    }
    if (seenInFile.has(key)) {
      skipped.push({
        platformRoomId: row.platformRoomId,
        snapshotEndAt: row.snapshotEndAt,
        reason: 'DUPLICATE_IN_FILE',
      });
      continue;
    }
    seenInFile.add(key);
    toInsert.push(buildSnapshot(room.id, rawRowIds.get(row.rowIndex)!, row));
  }

  const created = await repo.insertSnapshots(toInsert);

  let attribution: RecomputeResult | null = null;
  if (created.length > 0) {
    const touched = toInsert.map((snapshot) => snapshot.snapshotEndAt.getTime());
    const roomStarts = parsed.rows.map((row) => row.roomStartAt.getTime());
    attribution = await recomputeWindow(
      repo,
      context.platformAccountId,
      new Date(Math.min(...roomStarts, ...touched)),
      new Date(Math.max(...touched)),
    );
  }

  const failedRows = parsed.failedRows.map((row) => ({ rowIndex: row.rowIndex, reason: row.reason }));
  await repo.finishImport(importId, {
    status: failedRows.length > 0 ? 'PARTIALLY_MATCHED' : 'MATCHED',
    errorSummary:
      failedRows.length > 0 || skipped.length > 0 ? { failedRows, skipped: skipped.length } : null,
  });

  return {
    status: 'IMPORTED',
    importId,
    rowsParsed: parsed.rows.length,
    failedRows,
    rooms: [...rooms.values()].map((room) => ({
      platformRoomId: room.platformRoomId,
      roomId: room.id,
    })),
    snapshotsCreated: created.length,
    skippedSnapshots: skipped,
    attribution,
  };
}

function buildSnapshot(roomId: string, rawImportRowId: string, row: LiveSnapshotRow): NewSnapshot {
  return {
    roomId,
    rawImportRowId,
    snapshotEndAt: row.snapshotEndAt,
    durationMinutes: row.durationMinutes,
    metrics: row.metrics,
    reportedDerived: row.reportedDerived,
  };
}
