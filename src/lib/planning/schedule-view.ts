import { formatMoney, formatTimeRange, PLATFORM_TIME_ZONE } from '../format';
import type { SessionOwnership } from '../attribution/types';
import type { SessionStatus } from './types';

export interface ScheduleSessionInput {
  sessionId: string;
  brandName: string;
  sessionDate: string;
  status: SessionStatus;
  ownership: SessionOwnership;
  plannedStartAt: string;
  plannedEndAt: string;
  targetGmv: string | null;
  hostNames: string[];
  assistantNames: string[];
  needs: { role: 'HOST' | 'ASSISTANT'; headcount: number }[];
}

export type ScheduleTone = 'neutral' | 'live' | 'done' | 'attention' | 'blocking' | 'outside';

export interface ScheduleSession {
  sessionId: string;
  brandName: string;
  timeLabel: string;
  statusLabel: string;
  tone: ScheduleTone;
  hostNames: string[];
  assistantNames: string[];
  targetLabel: string | null;
  missingLabel: string | null;
  /** Roles still short of their headcount, so the assign form opens on one. */
  missingRoles: ('HOST' | 'ASSISTANT')[];
}

export interface ScheduleDay {
  date: string;
  weekdayLabel: string;
  dayLabel: string;
  isToday: boolean;
  sessions: ScheduleSession[];
}

const STATUS_LABELS: Record<SessionStatus, { label: string; tone: ScheduleTone }> = {
  DRAFT: { label: 'Nháp', tone: 'outside' },
  PLANNING: { label: 'Đang lên lịch', tone: 'neutral' },
  OPEN_FOR_BOOKING: { label: 'Đang mở đăng ký', tone: 'attention' },
  PENDING_APPROVAL: { label: 'Chờ duyệt', tone: 'attention' },
  CONFIRMED: { label: 'Đã chốt', tone: 'neutral' },
  READY: { label: 'Sẵn sàng', tone: 'neutral' },
  LIVE: { label: 'Đang live', tone: 'live' },
  DATA_PENDING: { label: 'Chờ dữ liệu', tone: 'attention' },
  DATA_PARTIAL: { label: 'Thiếu dữ liệu', tone: 'attention' },
  DATA_COMPLETE: { label: 'Đủ dữ liệu', tone: 'done' },
  ANALYZED: { label: 'Đã phân tích', tone: 'done' },
  COMPLETED: { label: 'Hoàn tất', tone: 'done' },
  CANCELLED: { label: 'Đã huỷ', tone: 'outside' },
};

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

/** A date string in GMT+7, which is the only calendar this business uses. */
export function platformToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PLATFORM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * `session_date` is a calendar date, not an instant, so the arithmetic here
 * stays in one zone from start to finish. Parsing it at GMT+7 midnight and then
 * reading UTC days would land on the previous date for every hour before 07:00.
 */
function calendarDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function weekDates(anchor: string): string[] {
  const start = calendarDate(anchor);
  // Weeks run Monday to Sunday, the way the schedule is discussed.
  const weekday = (start.getUTCDay() + 6) % 7;
  const monday = new Date(start.getTime() - weekday * 24 * 60 * 60 * 1000);

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday.getTime() + index * 24 * 60 * 60 * 1000);
    return day.toISOString().slice(0, 10);
  });
}

function shortfall(input: ScheduleSessionInput): {
  label: string | null;
  roles: ('HOST' | 'ASSISTANT')[];
} {
  const parts: string[] = [];
  const roles: ('HOST' | 'ASSISTANT')[] = [];

  for (const need of input.needs) {
    const assigned = need.role === 'HOST' ? input.hostNames.length : input.assistantNames.length;
    const missing = need.headcount - assigned;
    if (missing > 0) {
      parts.push(`${missing} ${need.role === 'HOST' ? 'host' : 'trợ live'}`);
      roles.push(need.role);
    }
  }

  return { label: parts.length === 0 ? null : `Còn thiếu ${parts.join(', ')}`, roles };
}

export function buildSchedule(
  sessions: ScheduleSessionInput[],
  anchor: string,
  today: string,
): ScheduleDay[] {
  return weekDates(anchor).map((date) => {
    const day = calendarDate(date);

    return {
      date,
      weekdayLabel: WEEKDAYS[day.getUTCDay()],
      dayLabel: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
      isToday: date === today,
      // Grouped by the day the shift starts. A shift ending after midnight
      // stays on its start day rather than appearing on two (docs/01 §12).
      sessions: sessions
        .filter((session) => session.sessionDate === date)
        .sort((a, b) => a.plannedStartAt.localeCompare(b.plannedStartAt))
        .map((session) => {
          const missing = shortfall(session);
          // Who ran the shift outranks how far its data got: an unconfirmed
          // stretch counts toward nothing until someone classifies it, and the
          // badge has to say that rather than showing a data status beside an
          // amber colour that means something else (docs/06 §3.2).
          const ownershipLabel =
            session.ownership === 'BRAND_INHOUSE'
              ? { label: 'Brand tự live', tone: 'outside' as const }
              : session.ownership === 'UNKNOWN'
                ? { label: 'Chưa rõ ai vận hành', tone: 'attention' as const }
                : null;

          return {
            sessionId: session.sessionId,
            brandName: session.brandName,
            timeLabel: formatTimeRange(
              new Date(session.plannedStartAt),
              new Date(session.plannedEndAt),
            ),
            statusLabel: ownershipLabel?.label ?? STATUS_LABELS[session.status].label,
            tone: ownershipLabel?.tone ?? STATUS_LABELS[session.status].tone,
            hostNames: session.hostNames,
            assistantNames: session.assistantNames,
            targetLabel: session.targetGmv === null ? null : formatMoney(session.targetGmv),
            missingLabel: missing.label,
            missingRoles: missing.roles,
          };
        }),
    };
  });
}
