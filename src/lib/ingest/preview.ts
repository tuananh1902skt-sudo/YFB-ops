import type { LiveParseResult } from '../parsing/live-performance';
import { importLivePerformance, type LiveImportReport } from './live-import';
import { MemoryRepository } from './memory-repository';
import type { ImportContext, IngestRepository } from './types';

/** Rooms and shifts just outside the file's own range still matter for a handover. */
const SEED_PADDING_MS = 24 * 60 * 60 * 1000;

/**
 * Works out what an upload would do, without storing anything.
 *
 * The assistant sees the subtraction before it is committed, which is the whole
 * point of the upload screen (docs/06 §A2). It runs the real import over a
 * sandbox loaded with the relevant slice of live data, rather than a second
 * implementation of the same rules — a preview that could disagree with the
 * commit would be worse than no preview at all.
 */
export async function previewLiveImport(
  source: IngestRepository,
  context: ImportContext,
  parsed: LiveParseResult,
): Promise<LiveImportReport> {
  const sandbox = new MemoryRepository('preview:');
  const settings = await source.getSettings();
  const existing = await source.findImportByHash(context.platformAccountId, context.fileHash);

  sandbox.seed({
    settings,
    imports: existing
      ? [
          {
            platformAccountId: context.platformAccountId,
            fileHash: context.fileHash,
            fileName: existing.fileName,
            uploadedAt: existing.uploadedAt,
          },
        ]
      : [],
  });

  if (parsed.status === 'PARSED' && parsed.rows.length > 0) {
    const from = new Date(
      Math.min(...parsed.rows.map((row) => row.roomStartAt.getTime())) - SEED_PADDING_MS,
    );
    const to = new Date(
      Math.max(...parsed.rows.map((row) => row.snapshotEndAt.getTime())) + SEED_PADDING_MS,
    );

    const rooms = await source.listRoomsInWindow(context.platformAccountId, from, to);
    sandbox.seed({
      rooms,
      snapshots: await source.listSnapshots(rooms.map((room) => room.id)),
      sessions: await source.listSessionsInWindow(context.platformAccountId, from, to),
    });
  }

  return importLivePerformance(sandbox, context, parsed);
}
