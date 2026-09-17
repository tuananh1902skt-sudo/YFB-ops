export type SessionStaffRole = 'HOST' | 'ASSISTANT';

export type BookingStatus =
  | 'OPEN'
  | 'REGISTERED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'CANCELLED';

export type SessionStatus =
  | 'DRAFT'
  | 'PLANNING'
  | 'OPEN_FOR_BOOKING'
  | 'PENDING_APPROVAL'
  | 'CONFIRMED'
  | 'READY'
  | 'LIVE'
  | 'DATA_PENDING'
  | 'DATA_PARTIAL'
  | 'DATA_COMPLETE'
  | 'ANALYZED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface StaffNeed {
  role: SessionStaffRole;
  headcount: number;
}
