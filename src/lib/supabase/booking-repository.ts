import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingRepository } from '../planning/book';
import type { SlotState } from '../planning/booking';
import type { BookingStatus, SessionStaffRole } from '../planning/types';
import { createAssignmentRepository } from './planning-repository';

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

const SLOT_SELECT =
  'id,session_id,brand_id,role_needed,headcount,start_at,end_at,status,shift_bookings(user_id,status)';

interface RawSlot {
  id: string;
  session_id: string;
  brand_id: string;
  role_needed: SessionStaffRole;
  headcount: number;
  start_at: string;
  end_at: string;
  status: BookingStatus;
  shift_bookings: { user_id: string; status: BookingStatus }[] | null;
}

function toSlot(raw: RawSlot): SlotState {
  return {
    slotId: raw.id,
    sessionId: raw.session_id,
    brandId: raw.brand_id,
    role: raw.role_needed,
    headcount: raw.headcount,
    startAt: new Date(raw.start_at),
    endAt: new Date(raw.end_at),
    status: raw.status,
    bookings: (raw.shift_bookings ?? []).map((booking) => ({
      userId: booking.user_id,
      status: booking.status,
    })),
  };
}

export function createBookingRepository(
  user: SupabaseClient,
  service: SupabaseClient,
): BookingRepository {
  const assignments = createAssignmentRepository(user, service);

  return {
    ...assignments,

    async getSlot(slotId): Promise<SlotState | null> {
      const { data, error } = await user
        .from('shift_slots')
        .select(SLOT_SELECT)
        .eq('id', slotId)
        .maybeSingle();
      fail('đọc ca đang mở', error);
      return data ? toSlot(data as unknown as RawSlot) : null;
    },

    async listSlotsForSession(sessionId): Promise<SlotState[]> {
      const { data, error } = await user
        .from('shift_slots')
        .select(SLOT_SELECT)
        .eq('session_id', sessionId);
      fail('đọc nhu cầu nhân sự của ca', error);
      return ((data ?? []) as unknown as RawSlot[]).map(toSlot);
    },

    async upsertBooking(slotId, userId, status, note) {
      // Re-registering after withdrawing reuses the same row: the unique key is
      // (slot, person), so a cancelled registration is revived rather than
      // duplicated.
      const { error } = await user
        .from('shift_bookings')
        .upsert(
          { slot_id: slotId, user_id: userId, status, note },
          { onConflict: 'slot_id,user_id' },
        );
      fail('ghi đăng ký ca', error);
    },

    async setBookingReview(slotId, userId, status, reviewedBy, note) {
      const update: Record<string, unknown> = {
        status,
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
      };
      if (note !== null) update.note = note;

      const { error } = await user
        .from('shift_bookings')
        .update(update)
        .eq('slot_id', slotId)
        .eq('user_id', userId);
      fail('cập nhật đăng ký ca', error);
    },

    async setSessionStatus(sessionId, status) {
      // Through the service client: the status here follows from staffing, not
      // from someone editing the shift, and a host registering must not need
      // permission to write the shift row.
      const { error } = await service
        .from('live_sessions')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', sessionId)
        .in('status', ['PLANNING', 'OPEN_FOR_BOOKING', 'PENDING_APPROVAL', 'CONFIRMED']);
      fail('cập nhật trạng thái ca', error);
    },
  };
}
