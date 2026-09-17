import type { Decimal } from 'decimal.js';
import type { SessionOwnership } from '../attribution/types';

export type QueueKey =
  | 'DATA_OVERDUE'
  | 'NEEDS_REVIEW'
  | 'OWNERSHIP_UNKNOWN'
  | 'UNALLOCATED_GMV'
  | 'EVENTS_PENDING_REVIEW'
  | 'UNSTAFFED_SESSIONS';

export interface QueueItemDefinition {
  key: QueueKey;
  label: string;
  /** Urgent items block a correct number; the rest are housekeeping. */
  urgent: boolean;
  href: string;
}

/**
 * The order is the order Operation should work in: anything that makes a
 * reported figure wrong comes before anything that is merely unfinished
 * (docs/06 §B1).
 */
export const QUEUE_DEFINITIONS: QueueItemDefinition[] = [
  {
    key: 'DATA_OVERDUE',
    label: 'Ca chưa nộp dữ liệu quá hạn',
    urgent: true,
    href: '/operations/cho-du-lieu',
  },
  {
    key: 'NEEDS_REVIEW',
    label: 'Kết quả bất thường cần rà soát',
    urgent: true,
    href: '/operations/ra-soat',
  },
  {
    key: 'OWNERSHIP_UNKNOWN',
    label: 'Đoạn live chưa rõ của agency hay brand tự live',
    urgent: true,
    href: '/operations/ownership',
  },
  {
    key: 'UNALLOCATED_GMV',
    label: 'GMV chưa quy kết được cho ca nào',
    urgent: false,
    href: '/operations/chua-quy-ket',
  },
  {
    key: 'EVENTS_PENDING_REVIEW',
    label: 'Sự kiện chờ hậu kiểm',
    urgent: false,
    href: '/operations/su-kien',
  },
  {
    key: 'UNSTAFFED_SESSIONS',
    label: 'Ca chưa có người',
    urgent: false,
    href: '/operations/phan-ca',
  },
];

export interface QueueCount {
  key: QueueKey;
  count: number;
  /** Only where a figure is at stake, e.g. the GMV sitting unattributed. */
  amount: Decimal | null;
}

export interface UnknownStretch {
  sessionId: string;
  brandId: string;
  brandName: string;
  platformAccountId: string;
  sessionDate: string;
  startAt: Date;
  endAt: Date;
  roomIds: string[];
  platformRoomIds: string[];
  gmv: Decimal | null;
  orders: number | null;
  /** Booked shifts nearby, offered as the answer to "was this ours?". */
  nearbySessions: NearbySession[];
}

export interface NearbySession {
  sessionId: string;
  startAt: Date;
  endAt: Date;
  ownership: SessionOwnership;
  status: string;
  hostNames: string[];
}
