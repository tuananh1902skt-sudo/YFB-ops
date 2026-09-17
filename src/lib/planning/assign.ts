import type { AuditEntry } from '../ingest/types';
import { findConflicts, type Assignment } from './conflicts';
import { PlanningError } from './session-form';
import type { SessionStaffRole } from './types';

export interface AssignableSession {
  id: string;
  brandId: string;
  status: string;
  startAt: Date;
  endAt: Date;
}

export interface AssignmentRepository {
  getSession(sessionId: string): Promise<AssignableSession | null>;
  /** Everything this person is already on, across every brand. */
  listAssignmentsFor(userId: string, from: Date, to: Date): Promise<Assignment[]>;
  addStaff(sessionId: string, userId: string, role: SessionStaffRole): Promise<void>;
  removeStaff(sessionId: string, userId: string, role: SessionStaffRole): Promise<void>;
  writeAuditLogs(entries: AuditEntry[]): Promise<void>;
}

export interface AssignInput {
  sessionId: string;
  userId: string;
  role: SessionStaffRole;
  actorId: string;
  /** Set only when Operation has seen the clash and chosen to go ahead. */
  overrideReason?: string | null;
}

export class ScheduleConflictError extends PlanningError {
  constructor(
    message: string,
    readonly conflicts: Assignment[],
  ) {
    super(message);
  }
}

/** A clash beyond this window is not this shift's problem. */
const LOOKAROUND_MS = 24 * 60 * 60 * 1000;

function describe(conflicts: Assignment[]): string {
  return conflicts.map((conflict) => conflict.sessionLabel).join('; ');
}

/**
 * Puts a person on a shift, refusing a clash unless someone has decided to
 * accept it in writing.
 *
 * The clash is reported rather than silently resolved: two overlapping shifts
 * may genuinely be the plan (a short stretch covered from the same studio), and
 * only the person scheduling it knows which (docs/07 §G4).
 */
export async function assignStaff(
  repo: AssignmentRepository,
  input: AssignInput,
): Promise<{ conflicts: Assignment[] }> {
  const session = await repo.getSession(input.sessionId);
  if (!session) throw new PlanningError('Không tìm thấy ca này.');
  if (session.status === 'CANCELLED') {
    throw new PlanningError('Ca đã huỷ, không phân người được.');
  }

  const existing = await repo.listAssignmentsFor(
    input.userId,
    new Date(session.startAt.getTime() - LOOKAROUND_MS),
    new Date(session.endAt.getTime() + LOOKAROUND_MS),
  );
  const conflicts = findConflicts(existing, {
    startAt: session.startAt,
    endAt: session.endAt,
    excludeSessionId: session.id,
  });

  if (conflicts.length > 0 && !input.overrideReason?.trim()) {
    throw new ScheduleConflictError(
      `Người này đã được phân ca trùng giờ: ${describe(conflicts)}.`,
      conflicts,
    );
  }

  await repo.addStaff(input.sessionId, input.userId, input.role);

  if (conflicts.length > 0) {
    await repo.writeAuditLogs([
      {
        entityType: 'live_session_staff',
        entityId: `${input.sessionId}:${input.userId}`,
        action: 'ASSIGNED_DESPITE_CONFLICT',
        beforeData: null,
        afterData: {
          role: input.role,
          conflictsWith: conflicts.map((conflict) => conflict.sessionId),
        },
        reason: input.overrideReason!.trim(),
        actorId: input.actorId,
      },
    ]);
  }

  return { conflicts };
}

export async function unassignStaff(
  repo: AssignmentRepository,
  input: { sessionId: string; userId: string; role: SessionStaffRole; actorId: string; reason: string },
): Promise<void> {
  if (!input.reason.trim()) {
    throw new PlanningError('Phải nhập lý do khi gỡ người khỏi ca.');
  }

  await repo.removeStaff(input.sessionId, input.userId, input.role);
  await repo.writeAuditLogs([
    {
      entityType: 'live_session_staff',
      entityId: `${input.sessionId}:${input.userId}`,
      action: 'UNASSIGNED',
      beforeData: { role: input.role },
      afterData: null,
      reason: input.reason.trim(),
      actorId: input.actorId,
    },
  ]);
}
