import { formatDuration, formatMoney, formatTime } from '../format';
import type { SessionEventType } from './events';

export interface ConsoleEvent {
  id: string;
  eventType: SessionEventType;
  occurredAt: string;
  reason: string | null;
  actorName: string | null;
}

export interface LiveConsoleData {
  sessionId: string;
  brandName: string;
  shiftLabel: string;
  status: string;
  startedAt: string | null;
  plannedEndAt: string | null;
  hostNames: string[];
  assistantNames: string[];
  platformRoomId: string | null;
  targetGmvDisplay: string | null;
  events: ConsoleEvent[];
  /** Shifts this one can hand over to, offered in the handover dialog. */
  handoverTargets: { sessionId: string; label: string }[];
}

export const EVENT_LABELS: Record<SessionEventType, string> = {
  SESSION_STARTED: 'Bắt đầu ca',
  SESSION_ENDED: 'Kết thúc ca',
  HANDOVER_AGENCY_TEAM: 'Bàn giao ca',
  HANDOVER_TO_INHOUSE: 'Bàn giao cho brand tự live',
  HANDOVER_FROM_INHOUSE: 'Nhận lại từ brand',
  HOST_CHANGED: 'Đổi host',
  ASSISTANT_CHANGED: 'Đổi trợ live',
  OVERTIME_EXTENDED: 'Kéo dài ca (OT)',
  ENDED_EARLY: 'Off sớm',
  RESTART_TECHNICAL: 'Restart phòng live (sự cố)',
  RESTART_STRATEGIC: 'Restart phòng live (chủ động)',
  UPLOAD_CORRECTED: 'Operation sửa gắn nhãn file',
};

/** Quick picks, so a reason is one tap rather than a sentence typed mid-stream. */
export const REASON_SUGGESTIONS: Partial<Record<SessionEventType, string[]>> = {
  RESTART_TECHNICAL: ['Mất mạng', 'Mất điện', 'Lỗi nền tảng', 'Thiết bị lỗi'],
  RESTART_STRATEGIC: ['Làm mới traffic', 'Đổi chủ đề phiên'],
  ENDED_EARLY: ['Hiệu suất thấp', 'Brand yêu cầu off', 'Hết hàng', 'Sự cố nhân sự'],
  OVERTIME_EXTENDED: ['Đang lên đơn tốt', 'Brand yêu cầu kéo dài', 'Bù giờ bị gián đoạn'],
};

export function elapsedLabel(startedAt: string | null, now: number): string {
  if (!startedAt) return '—';
  return formatDuration((now - new Date(startedAt).getTime()) / 60_000);
}

export function eventLine(event: ConsoleEvent): { time: string; text: string } {
  const label = EVENT_LABELS[event.eventType];
  return {
    time: formatTime(new Date(event.occurredAt)),
    text: event.reason ? `${label} — ${event.reason}` : label,
  };
}

export function targetLabel(targetGmv: string | null): string | null {
  return targetGmv === null ? null : formatMoney(targetGmv);
}
