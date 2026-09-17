import type { SessionOwnership } from '../attribution/types';
import type { AuditEntry } from '../ingest/types';

export interface OwnershipSession {
  id: string;
  platformAccountId: string;
  brandId: string;
  ownership: SessionOwnership;
  status: string;
  startAt: Date;
  endAt: Date;
}

export interface OwnershipRepository {
  getSession(sessionId: string): Promise<OwnershipSession | null>;
  setOwnership(sessionId: string, ownership: SessionOwnership, actorId: string): Promise<void>;
  extendSessionWindow(sessionId: string, startAt: Date, endAt: Date): Promise<void>;
  cancelSession(sessionId: string, note: string): Promise<void>;
  supersedeAttributions(sessionIds: string[]): Promise<void>;
  writeAuditLogs(entries: AuditEntry[]): Promise<void>;
  /** Re-derives every shift in the window from the snapshots on record. */
  recompute(platformAccountId: string, from: Date, to: Date): Promise<void>;
}

export class OwnershipDecisionError extends Error {}

function requireReason(reason: string): string {
  const trimmed = reason.trim();
  // Whose revenue a stretch counts as decides what the agency invoices for, so
  // the reason is not optional (CLAUDE.md §11).
  if (trimmed.length === 0) {
    throw new OwnershipDecisionError('Phải nhập lý do cho quyết định này.');
  }
  return trimmed;
}

async function loadUnknown(
  repo: OwnershipRepository,
  sessionId: string,
): Promise<OwnershipSession> {
  const session = await repo.getSession(sessionId);
  if (!session) throw new OwnershipDecisionError('Không tìm thấy ca này.');
  if (session.ownership !== 'UNKNOWN') {
    throw new OwnershipDecisionError(
      'Ca này đã được xác nhận trước đó. Tải lại danh sách để xem trạng thái mới nhất.',
    );
  }
  return session;
}

function ownershipAudit(
  session: OwnershipSession,
  ownership: SessionOwnership,
  reason: string,
  actorId: string,
): AuditEntry {
  return {
    entityType: 'live_sessions',
    entityId: session.id,
    action: 'OWNERSHIP_CONFIRMED',
    beforeData: { ownership: session.ownership },
    afterData: { ownership },
    reason,
    actorId,
  };
}

/**
 * Records that the brand ran this stretch themselves.
 *
 * The figures are kept rather than deleted — they are needed to say how much of
 * a day's GMV the agency produced — but from here they are excluded from every
 * agency KPI (docs/01 §3).
 */
export async function confirmBrandInhouse(
  repo: OwnershipRepository,
  sessionId: string,
  reason: string,
  actorId: string,
): Promise<void> {
  const checked = requireReason(reason);
  const session = await loadUnknown(repo, sessionId);

  await repo.setOwnership(session.id, 'BRAND_INHOUSE', actorId);
  await repo.writeAuditLogs([ownershipAudit(session, 'BRAND_INHOUSE', checked, actorId)]);
}

/** The agency did run this stretch; the booking was simply never recorded. */
export async function confirmAgencyShift(
  repo: OwnershipRepository,
  sessionId: string,
  reason: string,
  actorId: string,
): Promise<void> {
  const checked = requireReason(reason);
  const session = await loadUnknown(repo, sessionId);

  await repo.setOwnership(session.id, 'AGENCY', actorId);
  await repo.writeAuditLogs([ownershipAudit(session, 'AGENCY', checked, actorId)]);
}

/**
 * Folds a discovered stretch into the booked shift it really belonged to.
 *
 * The figures are not moved by hand. The booked shift's actual window is widened
 * to cover the stretch, the placeholder is cancelled, and the attribution engine
 * recomputes from the snapshots — so the result is the same one a correctly
 * booked shift would have produced in the first place.
 */
export async function mergeIntoSession(
  repo: OwnershipRepository,
  discoveredSessionId: string,
  targetSessionId: string,
  reason: string,
  actorId: string,
): Promise<void> {
  const checked = requireReason(reason);
  if (discoveredSessionId === targetSessionId) {
    throw new OwnershipDecisionError('Không gộp một ca vào chính nó.');
  }

  const discovered = await loadUnknown(repo, discoveredSessionId);
  const target = await repo.getSession(targetSessionId);
  if (!target) throw new OwnershipDecisionError('Không tìm thấy ca đích.');
  if (target.status === 'CANCELLED') {
    throw new OwnershipDecisionError('Ca đích đã bị huỷ, không gộp vào được.');
  }
  if (target.platformAccountId !== discovered.platformAccountId) {
    throw new OwnershipDecisionError(
      'Hai ca thuộc hai tài khoản nền tảng khác nhau — không thể là cùng một phiên live.',
    );
  }

  const startAt = new Date(Math.min(target.startAt.getTime(), discovered.startAt.getTime()));
  const endAt = new Date(Math.max(target.endAt.getTime(), discovered.endAt.getTime()));

  // Cancel first: while the placeholder still matches, the stretch would look
  // like it belongs to two shifts at once and come back unallocated.
  await repo.cancelSession(
    discovered.id,
    `Gộp vào ca ${targetSessionId}: ${checked}`,
  );
  await repo.supersedeAttributions([discovered.id]);
  await repo.extendSessionWindow(target.id, startAt, endAt);

  await repo.writeAuditLogs([
    {
      entityType: 'live_sessions',
      entityId: discovered.id,
      action: 'MERGED_INTO_SESSION',
      beforeData: {
        ownership: discovered.ownership,
        status: discovered.status,
        startAt: discovered.startAt.toISOString(),
        endAt: discovered.endAt.toISOString(),
      },
      afterData: { status: 'CANCELLED', mergedInto: target.id },
      reason: checked,
      actorId,
    },
    {
      entityType: 'live_sessions',
      entityId: target.id,
      action: 'WINDOW_EXTENDED_BY_MERGE',
      beforeData: {
        startAt: target.startAt.toISOString(),
        endAt: target.endAt.toISOString(),
      },
      afterData: {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        mergedFrom: discovered.id,
      },
      reason: checked,
      actorId,
    },
  ]);

  await repo.recompute(discovered.platformAccountId, startAt, endAt);
}
