import { Decimal } from 'decimal.js';
import { NOT_AVAILABLE, formatMoney, formatTimeRange } from '../format';
import { targetAchievement } from '../kpi/formulas';
import type { SessionOwnership } from '../attribution/types';
import type { Alert, CommandCenter, TodayShift } from './types';

/** Một ca hôm nay, đã kèm kết quả nếu engine đã tách được. */
export interface CommandCenterSession {
  sessionId: string;
  brandName: string;
  startAt: Date | null;
  endAt: Date | null;
  staffNames: string[];
  status: string;
  ownership: SessionOwnership;
  gmv: string | null;
  targetGmv: string | null;
}

export interface CommandCenterInput {
  today: string;
  now: Date;
  sessions: CommandCenterSession[];
  /** Đếm trên toàn bộ dữ liệu người này thấy được, không chỉ hôm nay. */
  counts: {
    unknownOwnership: number;
    awaitingData: number;
    pendingBookings: number;
    unstaffedSlots: number;
  };
  unallocatedGmv: Decimal | null;
}

function toShift(session: CommandCenterSession, now: Date): TodayShift {
  const gmv = session.gmv === null ? null : new Decimal(session.gmv);
  const target = session.targetGmv === null ? null : new Decimal(session.targetGmv);

  return {
    sessionId: session.sessionId,
    brandName: session.brandName,
    timeLabel:
      session.startAt && session.endAt
        ? formatTimeRange(session.startAt, session.endAt)
        : 'Chưa đặt giờ',
    staffNames: session.staffNames,
    status: session.status,
    ownership: session.ownership,
    isLive:
      session.startAt !== null &&
      session.endAt !== null &&
      session.startAt <= now &&
      now < session.endAt &&
      session.status !== 'CANCELLED',
    gmvDisplay: gmv === null ? null : formatMoney(gmv),
    targetDisplay: target === null ? null : formatMoney(target),
    progress: targetAchievement(gmv, target),
  };
}

function alertsFrom(input: CommandCenterInput, shifts: TodayShift[]): Alert[] {
  const alerts: Alert[] = [];
  const { counts } = input;

  if (counts.unknownOwnership > 0) {
    alerts.push({
      severity: 'critical',
      count: counts.unknownOwnership,
      headline: `${counts.unknownOwnership} đoạn live chưa rõ ai vận hành`,
      detail: 'Chưa vào KPI nào cho tới khi xác nhận agency hay brand tự live.',
      href: '/operations/ownership',
    });
  }

  if (input.unallocatedGmv !== null && !input.unallocatedGmv.isZero()) {
    alerts.push({
      severity: 'critical',
      count: 1,
      headline: `${formatMoney(input.unallocatedGmv)} chưa quy kết được`,
      detail: 'Thiếu report ở ranh giới bàn giao, tiền này chưa thuộc về ca nào.',
      href: '/operations',
    });
  }

  // Chỉ ca agency mới cần người. Ca brand tự live không có ai bên mình là đúng
  // theo định nghĩa — báo động ở đó là báo động giả, và báo động giả lặp lại vài
  // lần thì người dùng bỏ qua cả những cái thật.
  const unstaffedToday = shifts.filter(
    (shift) =>
      shift.ownership === 'AGENCY' && shift.staffNames.length === 0 && shift.status !== 'CANCELLED',
  ).length;
  if (unstaffedToday > 0) {
    alerts.push({
      severity: 'critical',
      count: unstaffedToday,
      headline: `${unstaffedToday} ca hôm nay chưa có người`,
      detail: 'Sắp tới giờ live mà chưa ai được phân công.',
      href: '/schedule',
    });
  }

  if (counts.awaitingData > 0) {
    alerts.push({
      severity: 'warning',
      count: counts.awaitingData,
      headline: `${counts.awaitingData} ca chờ dữ liệu`,
      detail: 'Trợ live chưa nộp report, số của kỳ này còn thiếu.',
      href: '/operations',
    });
  }

  if (counts.pendingBookings > 0) {
    alerts.push({
      severity: 'warning',
      count: counts.pendingBookings,
      headline: `${counts.pendingBookings} đăng ký chờ duyệt`,
      detail: 'Người đăng ký chưa biết mình có được nhận ca hay không.',
      href: '/operations/bookings',
    });
  }

  if (counts.unstaffedSlots > 0) {
    alerts.push({
      severity: 'warning',
      count: counts.unstaffedSlots,
      headline: `${counts.unstaffedSlots} ca đang mở chưa ai đăng ký`,
      detail: 'Mở lâu mà không ai nhận thì nên nhắc trực tiếp.',
      href: '/shifts',
    });
  }

  return alerts;
}

export function buildCommandCenter(input: CommandCenterInput): CommandCenter {
  const shifts = input.sessions
    .map((session) => toShift(session, input.now))
    .sort((a, b) => a.timeLabel.localeCompare(b.timeLabel));

  const live = shifts.filter((shift) => shift.isLive);
  const active = shifts.filter((shift) => shift.status !== 'CANCELLED');
  const alerts = alertsFrom(input, shifts);

  // KPI agency chỉ tính trên ca của agency; ca brand tự live và ca chưa rõ
  // ownership nằm ngoài cả tử số lẫn mẫu số (CLAUDE.md §9). Phần brand tự live
  // vẫn hiện, nhưng hiện cạnh chứ không hiện trong.
  const agency = input.sessions.filter(
    (session) => session.ownership === 'AGENCY' && session.status !== 'CANCELLED',
  );
  const inhouse = input.sessions.filter((session) => session.ownership === 'BRAND_INHOUSE');

  const sumGmv = (rows: CommandCenterSession[]): Decimal | null => {
    // Ca chưa tách được để ngoài, không quy về 0 (docs/05 §10.1).
    const withValue = rows.filter((session) => session.gmv !== null);
    return withValue.length
      ? withValue.reduce((sum, session) => sum.plus(new Decimal(session.gmv!)), new Decimal(0))
      : null;
  };

  const gmvToday = sumGmv(agency);
  const inhouseGmv = sumGmv(inhouse);
  const missingData = agency.filter((session) => session.gmv === null).length;

  const targets = agency
    .map((session) => session.targetGmv)
    .filter((value): value is string => value !== null);
  const targetToday = targets.length
    ? targets.reduce((sum, value) => sum.plus(new Decimal(value)), new Decimal(0))
    : null;

  return {
    dateLabel: `${input.today.slice(8, 10)}/${input.today.slice(5, 7)}/${input.today.slice(0, 4)}`,
    shifts,
    live,
    alerts,
    quiet: active.length === 0 && alerts.length === 0,
    tiles: [
      {
        label: 'Ca agency hôm nay',
        value: String(agency.length),
        caveat:
          [
            live.length > 0 ? `${live.length} đang live` : null,
            inhouse.length > 0 ? `${inhouse.length} ca brand tự live` : null,
          ]
            .filter(Boolean)
            .join(' · ') || null,
      },
      {
        label: 'GMV agency hôm nay',
        value: gmvToday === null ? NOT_AVAILABLE : formatMoney(gmvToday),
        caveat:
          [
            missingData > 0 ? `${missingData} ca chưa có dữ liệu` : null,
            inhouseGmv === null ? null : `brand tự live thêm ${formatMoney(inhouseGmv)}`,
          ]
            .filter(Boolean)
            .join(' · ') || null,
      },
      {
        label: 'Target hôm nay',
        value: targetToday === null ? NOT_AVAILABLE : formatMoney(targetToday),
        caveat: targetToday === null ? 'Chưa ca nào đặt target' : null,
      },
      {
        label: 'Việc cần xử lý',
        value: String(alerts.reduce((sum, alert) => sum + alert.count, 0)),
        caveat:
          alerts.filter((alert) => alert.severity === 'critical').length > 0
            ? `${alerts.filter((alert) => alert.severity === 'critical').length} việc gấp`
            : null,
      },
    ],
  };
}
