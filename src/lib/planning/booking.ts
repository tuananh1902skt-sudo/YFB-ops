import { PlanningError } from './session-form';
import type { BookingStatus, SessionStaffRole } from './types';

export interface SlotState {
  slotId: string;
  sessionId: string;
  brandId: string;
  role: SessionStaffRole;
  headcount: number;
  startAt: Date;
  endAt: Date;
  status: BookingStatus;
  /** Registrations already on this slot, including the person's own. */
  bookings: { userId: string; status: BookingStatus }[];
}

/** Registrations still in play — everything else has been settled. */
const LIVE_STATUSES: BookingStatus[] = ['REGISTERED', 'PENDING_APPROVAL', 'APPROVED', 'CONFIRMED'];

export function approvedCount(slot: SlotState): number {
  return slot.bookings.filter(
    (booking) => booking.status === 'APPROVED' || booking.status === 'CONFIRMED',
  ).length;
}

export function isFull(slot: SlotState): boolean {
  return approvedCount(slot) >= slot.headcount;
}

export function hasLiveBooking(slot: SlotState, userId: string): boolean {
  return slot.bookings.some(
    (booking) => booking.userId === userId && LIVE_STATUSES.includes(booking.status),
  );
}

/**
 * Whether this person may put their name down for this slot.
 *
 * A clash with their own schedule is deliberately not checked here: it is
 * reported to them as a warning, and enforced once, at approval, where the
 * override and its reason belong (docs/07 §G4).
 */
export function assertCanRegister(slot: SlotState, userId: string, now: Date): void {
  if (slot.status === 'CANCELLED') {
    throw new PlanningError('Ca này đã huỷ.');
  }
  if (hasLiveBooking(slot, userId)) {
    throw new PlanningError('Bạn đã đăng ký ca này rồi.');
  }
  if (isFull(slot)) {
    throw new PlanningError('Ca này đã đủ người.');
  }
  if (slot.startAt.getTime() <= now.getTime()) {
    throw new PlanningError('Ca đã bắt đầu, không đăng ký được nữa.');
  }
}

export function assertCanApprove(slot: SlotState, userId: string): void {
  const booking = slot.bookings.find((item) => item.userId === userId);
  if (!booking) throw new PlanningError('Không tìm thấy đăng ký này.');
  if (booking.status === 'APPROVED' || booking.status === 'CONFIRMED') {
    throw new PlanningError('Đăng ký này đã được duyệt trước đó.');
  }
  if (booking.status === 'REJECTED' || booking.status === 'CANCELLED') {
    throw new PlanningError('Đăng ký này đã bị từ chối hoặc đã huỷ.');
  }
  // Approving past the headcount would put more people on a shift than the
  // brand is paying for, so it is refused rather than warned about.
  if (isFull(slot)) {
    throw new PlanningError('Ca này đã đủ người — không duyệt thêm được.');
  }
}

export function assertCanCancel(slot: SlotState, userId: string): void {
  const booking = slot.bookings.find((item) => item.userId === userId);
  if (!booking) throw new PlanningError('Bạn chưa đăng ký ca này.');
  if (booking.status === 'APPROVED' || booking.status === 'CONFIRMED') {
    // Once approved, the shift is staffed around them; withdrawing is
    // Operation's decision so a replacement can be found.
    throw new PlanningError(
      'Đăng ký đã được duyệt. Báo Operation để đổi người, đừng tự huỷ.',
    );
  }
  if (booking.status !== 'REGISTERED' && booking.status !== 'PENDING_APPROVAL') {
    throw new PlanningError('Đăng ký này không còn ở trạng thái huỷ được.');
  }
}

/** A shift is settled once every role it asked for is filled. */
export function allSlotsFilled(slots: SlotState[]): boolean {
  return slots.length > 0 && slots.every((slot) => isFull(slot));
}
