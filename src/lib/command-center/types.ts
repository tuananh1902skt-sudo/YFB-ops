import type { SessionOwnership } from '../attribution/types';

/**
 * Trung tâm điều hành (master prompt §30).
 *
 * Màn hình này trả lời đúng một câu: **ngay lúc này cần xử lý gì**. Nó không
 * phải bản thu nhỏ của dashboard — dashboard nói chuyện đã qua, còn đây nói
 * chuyện đang diễn ra và chuyện đang kẹt.
 */

export interface TodayShift {
  sessionId: string;
  brandName: string;
  timeLabel: string;
  staffNames: string[];
  status: string;
  ownership: SessionOwnership;
  /** Đang phát sóng tại thời điểm xem. */
  isLive: boolean;
  gmvDisplay: string | null;
  targetDisplay: string | null;
  /** Phần trăm đạt target, để vẽ thanh tiến độ. null = chưa đặt target. */
  progress: number | null;
}

export type AlertSeverity = 'critical' | 'warning';

export interface Alert {
  severity: AlertSeverity;
  headline: string;
  detail: string;
  href: string;
  count: number;
}

export interface CommandCenter {
  dateLabel: string;
  /** Ca hôm nay, kể cả ca đã xong — xếp theo giờ bắt đầu. */
  shifts: TodayShift[];
  live: TodayShift[];
  alerts: Alert[];
  tiles: { label: string; value: string; caveat: string | null }[];
  /** Không ca, không cảnh báo — nói thẳng thay vì bày bảng rỗng. */
  quiet: boolean;
}
