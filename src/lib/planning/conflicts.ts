import type { SessionStaffRole } from './types';

export interface Assignment {
  sessionId: string;
  sessionLabel: string;
  role: SessionStaffRole;
  startAt: Date;
  endAt: Date;
}

export interface ProposedWindow {
  startAt: Date;
  endAt: Date;
  /** The shift being edited, which must not conflict with itself. */
  excludeSessionId?: string;
}

/**
 * Two shifts overlap only if one starts strictly before the other ends.
 *
 * Touching boundaries are the normal handover: the outgoing shift ends at the
 * exact moment the incoming one starts, and the same person may well work both.
 * Treating that as a clash would flag every handed-over day in the schedule.
 */
export function overlaps(a: { startAt: Date; endAt: Date }, b: { startAt: Date; endAt: Date }): boolean {
  return a.startAt.getTime() < b.endAt.getTime() && b.startAt.getTime() < a.endAt.getTime();
}

/**
 * Shifts this person is already on that clash with the proposed hours.
 *
 * Role is not part of the test: someone cannot host one shift while assisting
 * another at the same time (docs/07 §G4).
 */
export function findConflicts(existing: Assignment[], proposed: ProposedWindow): Assignment[] {
  return existing
    .filter((assignment) => assignment.sessionId !== proposed.excludeSessionId)
    .filter((assignment) => overlaps(assignment, proposed))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}
