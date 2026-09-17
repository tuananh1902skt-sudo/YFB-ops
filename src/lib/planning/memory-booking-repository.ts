import type { SlotState } from './booking';
import type { BookingRepository } from './book';
import { MemoryAssignmentRepository } from './memory-assignment-repository';
import type { BookingStatus } from './types';

interface StoredBooking {
  slotId: string;
  userId: string;
  status: BookingStatus;
  note: string | null;
  reviewedBy: string | null;
}

/** In-memory shift slots and registrations for tests. */
export class MemoryBookingRepository extends MemoryAssignmentRepository implements BookingRepository {
  slots: Omit<SlotState, 'bookings'>[] = [];
  bookings: StoredBooking[] = [];
  sessionStatuses = new Map<string, string>();

  private withBookings(slot: Omit<SlotState, 'bookings'>): SlotState {
    return {
      ...slot,
      bookings: this.bookings
        .filter((booking) => booking.slotId === slot.slotId)
        .map((booking) => ({ userId: booking.userId, status: booking.status })),
    };
  }

  async getSlot(slotId: string): Promise<SlotState | null> {
    const slot = this.slots.find((item) => item.slotId === slotId);
    return slot ? this.withBookings(slot) : null;
  }

  async listSlotsForSession(sessionId: string): Promise<SlotState[]> {
    return this.slots
      .filter((slot) => slot.sessionId === sessionId)
      .map((slot) => this.withBookings(slot));
  }

  async upsertBooking(slotId: string, userId: string, status: BookingStatus, note: string | null) {
    const existing = this.bookings.find(
      (booking) => booking.slotId === slotId && booking.userId === userId,
    );
    if (existing) {
      existing.status = status;
      existing.note = note;
      return;
    }
    this.bookings.push({ slotId, userId, status, note, reviewedBy: null });
  }

  async setBookingReview(
    slotId: string,
    userId: string,
    status: BookingStatus,
    reviewedBy: string,
    note: string | null,
  ) {
    const booking = this.bookings.find(
      (item) => item.slotId === slotId && item.userId === userId,
    );
    if (!booking) return;
    booking.status = status;
    booking.reviewedBy = reviewedBy;
    if (note !== null) booking.note = note;
  }

  async setSessionStatus(sessionId: string, status: 'PENDING_APPROVAL' | 'CONFIRMED') {
    this.sessionStatuses.set(sessionId, status);
  }
}
