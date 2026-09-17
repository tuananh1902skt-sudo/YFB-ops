import type { MemoryRepository } from '../ingest/memory-repository';
import { recomputeWindow } from '../ingest/recompute';
import type { SessionEventInput, SessionTimePatch } from './events';
import type { EventSession, SessionEventRepository } from './log-event';

/** In-memory event log for tests, backed by the ingest sandbox. */
export class MemoryEventRepository implements SessionEventRepository {
  events: (SessionEventInput & { id: string; createdBy: string })[] = [];
  private sequence = 0;

  constructor(private readonly store: MemoryRepository) {}

  async getSession(sessionId: string): Promise<EventSession | null> {
    const session = this.store.sessions.find((item) => item.id === sessionId);
    if (!session) return null;
    return {
      id: session.id,
      platformAccountId: session.platformAccountId,
      actualStartAt: session.startAt,
      actualEndAt: session.endAt,
      plannedStartAt: session.startAt,
      plannedEndAt: session.endAt,
    };
  }

  async insertEvent(event: SessionEventInput, createdBy: string): Promise<string> {
    this.sequence += 1;
    const id = `event-${this.sequence}`;
    this.events.push({ ...event, id, createdBy });
    return id;
  }

  async patchSessionTimes(patches: SessionTimePatch[]): Promise<void> {
    for (const patch of patches) {
      const session = this.store.sessions.find((item) => item.id === patch.sessionId);
      if (!session) continue;
      if (patch.actualStartAt) session.startAt = patch.actualStartAt;
      if (patch.actualEndAt) session.endAt = patch.actualEndAt;
    }
  }

  async recompute(platformAccountId: string, from: Date, to: Date): Promise<void> {
    await recomputeWindow(this.store, platformAccountId, from, to);
  }
}
