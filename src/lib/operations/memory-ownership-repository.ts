import type { SessionOwnership } from '../attribution/types';
import type { MemoryRepository } from '../ingest/memory-repository';
import { recomputeWindow } from '../ingest/recompute';
import type { AuditEntry } from '../ingest/types';
import type { OwnershipRepository, OwnershipSession } from './ownership';

/** In-memory ownership decisions for tests, backed by the ingest sandbox. */
export class MemoryOwnershipRepository implements OwnershipRepository {
  confirmedBy = new Map<string, { userId: string; at: Date }>();

  constructor(private readonly store: MemoryRepository) {}

  async getSession(sessionId: string): Promise<OwnershipSession | null> {
    const session = this.store.sessions.find((item) => item.id === sessionId);
    if (!session) return null;
    return {
      id: session.id,
      platformAccountId: session.platformAccountId,
      brandId: session.brandId,
      ownership: session.ownership,
      status: session.status,
      startAt: session.startAt,
      endAt: session.endAt,
    };
  }

  async setOwnership(sessionId: string, ownership: SessionOwnership, actorId: string) {
    const session = this.store.sessions.find((item) => item.id === sessionId)!;
    session.ownership = ownership;
    this.confirmedBy.set(sessionId, { userId: actorId, at: new Date() });
  }

  async extendSessionWindow(sessionId: string, startAt: Date, endAt: Date) {
    const session = this.store.sessions.find((item) => item.id === sessionId)!;
    session.startAt = startAt;
    session.endAt = endAt;
  }

  async cancelSession(sessionId: string) {
    const session = this.store.sessions.find((item) => item.id === sessionId)!;
    session.status = 'CANCELLED';
  }

  async supersedeAttributions(sessionIds: string[]) {
    await this.store.supersedeAttributions(sessionIds);
  }

  async writeAuditLogs(entries: AuditEntry[]) {
    await this.store.writeAuditLogs(entries);
  }

  async recompute(platformAccountId: string, from: Date, to: Date) {
    await recomputeWindow(this.store, platformAccountId, from, to);
  }
}
