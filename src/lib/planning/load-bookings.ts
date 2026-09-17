import type { SupabaseClient } from '@supabase/supabase-js';
import { formatDate, formatMoney, formatTimeRange } from '../format';
import type { BookingStatus, SessionStaffRole } from './types';

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export interface OpenSlotView {
  slotId: string;
  sessionId: string;
  brandName: string;
  dateLabel: string;
  timeLabel: string;
  roleLabel: string;
  targetLabel: string | null;
  spotsLeft: number;
  /** The signed-in person's own registration, if they have one. */
  myStatus: BookingStatus | null;
  registeredCount: number;
}

const ROLE_LABELS: Record<SessionStaffRole, string> = {
  HOST: 'Host',
  ASSISTANT: 'Trợ live',
};

const BOOKED = ['REGISTERED', 'PENDING_APPROVAL', 'APPROVED', 'CONFIRMED'];

/** Shifts still looking for people, plus whatever this person already put in for. */
export async function loadOpenSlots(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<OpenSlotView[]> {
  const { data, error } = await supabase
    .from('shift_slots')
    .select(
      'id,session_id,role_needed,headcount,start_at,end_at,status,shift_bookings(user_id,status),live_sessions(session_date,status,target_gmv::text,brands(name))',
    )
    .gte('start_at', now.toISOString())
    .order('start_at');
  fail('đọc ca đang mở', error);

  return (data ?? [])
    .map((row) => {
      const session = first(
        row.live_sessions as Record<string, unknown> | Record<string, unknown>[],
      ) as
        | {
            session_date: string;
            status: string;
            target_gmv: string | null;
            brands: { name: string } | { name: string }[] | null;
          }
        | null;
      if (!session || session.status === 'CANCELLED') return null;

      const bookings = (row.shift_bookings ?? []) as { user_id: string; status: BookingStatus }[];
      const approved = bookings.filter(
        (booking) => booking.status === 'APPROVED' || booking.status === 'CONFIRMED',
      ).length;
      const mine = bookings.find((booking) => booking.user_id === userId);

      return {
        slotId: row.id as string,
        sessionId: row.session_id as string,
        brandName: first(session.brands)?.name ?? '',
        dateLabel: formatDate(new Date(`${session.session_date}T00:00:00+07:00`)),
        timeLabel: formatTimeRange(new Date(row.start_at as string), new Date(row.end_at as string)),
        roleLabel: ROLE_LABELS[row.role_needed as SessionStaffRole],
        targetLabel: session.target_gmv === null ? null : formatMoney(session.target_gmv),
        spotsLeft: Math.max(0, (row.headcount as number) - approved),
        myStatus: mine && BOOKED.includes(mine.status) ? mine.status : null,
        registeredCount: bookings.filter((booking) => booking.status === 'REGISTERED').length,
      } satisfies OpenSlotView;
    })
    .filter((slot): slot is OpenSlotView => slot !== null)
    // A shift already filled is only worth showing if this person is on it.
    .filter((slot) => slot.spotsLeft > 0 || slot.myStatus !== null);
}

export interface PendingBookingView {
  slotId: string;
  userId: string;
  userName: string;
  brandName: string;
  dateLabel: string;
  timeLabel: string;
  roleLabel: string;
  spotsLeft: number;
  note: string | null;
}

/** Registrations waiting on Operation, oldest shift first. */
export async function loadPendingBookings(
  supabase: SupabaseClient,
): Promise<PendingBookingView[]> {
  const { data, error } = await supabase
    .from('shift_bookings')
    .select(
      'slot_id,user_id,status,note,users(full_name),shift_slots!inner(role_needed,headcount,start_at,end_at,session_id,shift_bookings(status),live_sessions(session_date,brands(name)))',
    )
    .in('status', ['REGISTERED', 'PENDING_APPROVAL'])
    .order('created_at');
  fail('đọc đăng ký chờ duyệt', error);

  return (data ?? [])
    .map((row) => {
      const slot = first(
        row.shift_slots as Record<string, unknown> | Record<string, unknown>[],
      ) as
        | {
            role_needed: SessionStaffRole;
            headcount: number;
            start_at: string;
            end_at: string;
            shift_bookings: { status: BookingStatus }[] | null;
            live_sessions:
              | { session_date: string; brands: { name: string } | { name: string }[] | null }
              | { session_date: string; brands: { name: string } | { name: string }[] | null }[]
              | null;
          }
        | null;
      if (!slot) return null;

      const session = first(slot.live_sessions);
      const approved = (slot.shift_bookings ?? []).filter(
        (booking) => booking.status === 'APPROVED' || booking.status === 'CONFIRMED',
      ).length;

      return {
        slotId: row.slot_id as string,
        userId: row.user_id as string,
        userName:
          first(row.users as { full_name: string } | { full_name: string }[] | null)?.full_name ??
          '',
        brandName: session ? (first(session.brands)?.name ?? '') : '',
        dateLabel: session
          ? formatDate(new Date(`${session.session_date}T00:00:00+07:00`))
          : '',
        timeLabel: formatTimeRange(new Date(slot.start_at), new Date(slot.end_at)),
        roleLabel: ROLE_LABELS[slot.role_needed],
        spotsLeft: Math.max(0, slot.headcount - approved),
        note: (row.note as string | null) ?? null,
      } satisfies PendingBookingView;
    })
    .filter((booking): booking is PendingBookingView => booking !== null);
}
