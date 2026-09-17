import type { AuditEntry } from '../ingest/types';
import type { AssignableSession, AssignmentRepository } from './assign';
import type { Assignment } from './conflicts';
import type { SessionStaffRole } from './types';

/** In-memory schedule for tests. */
export class MemoryAssignmentRepository implements AssignmentRepository {
  sessions: AssignableSession[] = [];
  staff: { sessionId: string; userId: string; role: SessionStaffRole }[] = [];
  auditLogs: AuditEntry[] = [];
  labels = new Map<string, string>();

  async getSession(sessionId: string): Promise<AssignableSession | null> {
    return this.sessions.find((session) => session.id === sessionId) ?? null;
  }

  async listAssignmentsFor(userId: string, from: Date, to: Date): Promise<Assignment[]> {
    return this.staff
      .filter((row) => row.userId === userId)
      .map((row) => {
        const session = this.sessions.find((item) => item.id === row.sessionId)!;
        return {
          sessionId: session.id,
          sessionLabel: this.labels.get(session.id) ?? session.id,
          role: row.role,
          startAt: session.startAt,
          endAt: session.endAt,
        };
      })
      .filter((assignment) => assignment.startAt < to && assignment.endAt > from);
  }

  async addStaff(sessionId: string, userId: string, role: SessionStaffRole): Promise<void> {
    this.staff.push({ sessionId, userId, role });
  }

  async removeStaff(sessionId: string, userId: string, role: SessionStaffRole): Promise<void> {
    this.staff = this.staff.filter(
      (row) => !(row.sessionId === sessionId && row.userId === userId && row.role === role),
    );
  }

  async writeAuditLogs(entries: AuditEntry[]): Promise<void> {
    this.auditLogs.push(...entries);
  }
}
