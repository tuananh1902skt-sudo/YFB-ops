import {
  SessionEventError,
  timePatchesFor,
  validateEvent,
  type SessionEventInput,
  type SessionTimePatch,
} from './events';

export interface EventSession {
  id: string;
  platformAccountId: string;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
}

export interface SessionEventRepository {
  getSession(sessionId: string): Promise<EventSession | null>;
  insertEvent(event: SessionEventInput, createdBy: string): Promise<string>;
  patchSessionTimes(patches: SessionTimePatch[]): Promise<void>;
  recompute(platformAccountId: string, from: Date, to: Date): Promise<void>;
}

/** Room time either side of the boundary that the change could re-attribute. */
const RECOMPUTE_PADDING_MS = 12 * 60 * 60 * 1000;

export interface LoggedEvent {
  eventId: string;
  timePatches: SessionTimePatch[];
}

/**
 * Records what the assistant says happened, and lets it move the shift
 * boundaries straight away.
 *
 * Nothing here waits for Operation to approve: a shift must never be held up by
 * a review queue (docs/01 §5). Operation checks afterwards, and a correction
 * then recomputes the same way this does.
 */
export async function logSessionEvent(
  repo: SessionEventRepository,
  event: SessionEventInput,
  createdBy: string,
  now: Date = new Date(),
): Promise<LoggedEvent> {
  const session = await repo.getSession(event.sessionId);
  if (!session) throw new SessionEventError('Không tìm thấy ca này.');

  validateEvent(event, { actualStartAt: session.actualStartAt, now });

  if (event.relatedSessionId) {
    const related = await repo.getSession(event.relatedSessionId);
    if (!related) throw new SessionEventError('Không tìm thấy ca nhận bàn giao.');
    if (related.platformAccountId !== session.platformAccountId) {
      throw new SessionEventError(
        'Ca nhận bàn giao thuộc tài khoản nền tảng khác — không cùng một phiên live.',
      );
    }
  }

  const eventId = await repo.insertEvent(event, createdBy);
  const timePatches = timePatchesFor(event);

  if (timePatches.length > 0) {
    await repo.patchSessionTimes(timePatches);
    // The boundary just moved, so the split has to follow it. Recomputing is
    // idempotent, which is what makes it safe to do on every such event.
    await repo.recompute(
      session.platformAccountId,
      new Date(event.occurredAt.getTime() - RECOMPUTE_PADDING_MS),
      new Date(event.occurredAt.getTime() + RECOMPUTE_PADDING_MS),
    );
  }

  return { eventId, timePatches };
}
