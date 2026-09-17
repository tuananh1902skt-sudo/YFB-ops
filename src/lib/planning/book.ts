import type { AuditEntry } from '../ingest/types';
import { assignStaff, type AssignmentRepository } from './assign';
import {
  allSlotsFilled,
  assertCanApprove,
  assertCanCancel,
  assertCanRegister,
  type SlotState,
} from './booking';
import { findConflicts, type Assignment } from './conflicts';
import { PlanningError } from './session-form';
import type { BookingStatus } from './types';

export interface BookingRepository extends AssignmentRepository {
  getSlot(slotId: string): Promise<SlotState | null>;
  listSlotsForSession(sessionId: string): Promise<SlotState[]>;
  upsertBooking(slotId: string, userId: string, status: BookingStatus, note: string | null): Promise<void>;
  setBookingReview(
    slotId: string,
    userId: string,
    status: BookingStatus,
    reviewedBy: string,
    note: string | null,
  ): Promise<void>;
  setSessionStatus(sessionId: string, status: 'PENDING_APPROVAL' | 'CONFIRMED'): Promise<void>;
}

export interface RegisterResult {
  /** Shifts this person is already on that clash — a warning, not a refusal. */
  conflicts: Assignment[];
}

const LOOKAROUND_MS = 24 * 60 * 60 * 1000;

/**
 * Puts someone's name down for an open shift.
 *
 * A clash with their own schedule is reported back rather than blocking: they
 * may know something the schedule does not, and the decision — with its reason
 * — belongs to whoever approves it.
 */
export async function registerForSlot(
  repo: BookingRepository,
  slotId: string,
  userId: string,
  note: string | null = null,
  now: Date = new Date(),
): Promise<RegisterResult> {
  const slot = await repo.getSlot(slotId);
  if (!slot) throw new PlanningError('Không tìm thấy ca này.');

  assertCanRegister(slot, userId, now);

  const existing = await repo.listAssignmentsFor(
    userId,
    new Date(slot.startAt.getTime() - LOOKAROUND_MS),
    new Date(slot.endAt.getTime() + LOOKAROUND_MS),
  );
  const conflicts = findConflicts(existing, {
    startAt: slot.startAt,
    endAt: slot.endAt,
    excludeSessionId: slot.sessionId,
  });

  await repo.upsertBooking(slotId, userId, 'REGISTERED', note);
  await repo.setSessionStatus(slot.sessionId, 'PENDING_APPROVAL');

  return { conflicts };
}

/**
 * Approves a registration, which is also the moment the person is actually put
 * on the shift — so it goes through the same conflict check as a direct
 * assignment, including the override and its reason.
 */
export async function approveBooking(
  repo: BookingRepository,
  input: { slotId: string; userId: string; actorId: string; overrideReason?: string | null },
): Promise<{ conflicts: Assignment[]; sessionConfirmed: boolean }> {
  const slot = await repo.getSlot(input.slotId);
  if (!slot) throw new PlanningError('Không tìm thấy ca này.');

  assertCanApprove(slot, input.userId);

  const result = await assignStaff(repo, {
    sessionId: slot.sessionId,
    userId: input.userId,
    role: slot.role,
    actorId: input.actorId,
    overrideReason: input.overrideReason,
  });

  await repo.setBookingReview(input.slotId, input.userId, 'APPROVED', input.actorId, null);

  // Once every role asked for is filled, the shift is settled and stops
  // appearing as open.
  const slots = await repo.listSlotsForSession(slot.sessionId);
  const confirmed = allSlotsFilled(slots);
  if (confirmed) await repo.setSessionStatus(slot.sessionId, 'CONFIRMED');

  return { conflicts: result.conflicts, sessionConfirmed: confirmed };
}

export async function rejectBooking(
  repo: BookingRepository,
  input: { slotId: string; userId: string; actorId: string; reason: string },
): Promise<void> {
  if (!input.reason.trim()) {
    // The person asked to work and is being turned down; they are owed a reason,
    // and so is whoever reviews staffing later.
    throw new PlanningError('Phải nhập lý do khi từ chối đăng ký.');
  }

  const slot = await repo.getSlot(input.slotId);
  if (!slot) throw new PlanningError('Không tìm thấy ca này.');

  const booking = slot.bookings.find((item) => item.userId === input.userId);
  if (!booking) throw new PlanningError('Không tìm thấy đăng ký này.');
  if (booking.status === 'APPROVED' || booking.status === 'CONFIRMED') {
    throw new PlanningError('Đăng ký đã duyệt — gỡ người khỏi ca thay vì từ chối.');
  }

  await repo.setBookingReview(
    input.slotId,
    input.userId,
    'REJECTED',
    input.actorId,
    input.reason.trim(),
  );
  await repo.writeAuditLogs([
    {
      entityType: 'shift_bookings',
      entityId: `${input.slotId}:${input.userId}`,
      action: 'BOOKING_REJECTED',
      beforeData: { status: booking.status },
      afterData: { status: 'REJECTED' },
      reason: input.reason.trim(),
      actorId: input.actorId,
    } satisfies AuditEntry,
  ]);
}

export async function cancelOwnBooking(
  repo: BookingRepository,
  slotId: string,
  userId: string,
): Promise<void> {
  const slot = await repo.getSlot(slotId);
  if (!slot) throw new PlanningError('Không tìm thấy ca này.');

  assertCanCancel(slot, userId);
  await repo.setBookingReview(slotId, userId, 'CANCELLED', userId, null);
}
