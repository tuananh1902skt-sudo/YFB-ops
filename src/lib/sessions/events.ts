export type SessionEventType =
  | 'SESSION_STARTED'
  | 'SESSION_ENDED'
  | 'HANDOVER_AGENCY_TEAM'
  | 'HANDOVER_TO_INHOUSE'
  | 'HANDOVER_FROM_INHOUSE'
  | 'HOST_CHANGED'
  | 'ASSISTANT_CHANGED'
  | 'OVERTIME_EXTENDED'
  | 'ENDED_EARLY'
  | 'RESTART_TECHNICAL'
  | 'RESTART_STRATEGIC'
  | 'UPLOAD_CORRECTED';

export interface SessionEventInput {
  sessionId: string;
  eventType: SessionEventType;
  occurredAt: Date;
  roomId?: string | null;
  relatedSessionId?: string | null;
  fromUserId?: string | null;
  toUserId?: string | null;
  reason?: string | null;
}

/** Which shift's actual start or end this event moves. */
export interface SessionTimePatch {
  sessionId: string;
  actualStartAt?: Date;
  actualEndAt?: Date;
}

export class SessionEventError extends Error {}

/** The database enforces these too; here they produce a usable message first. */
const REASON_REQUIRED: SessionEventType[] = [
  'ENDED_EARLY',
  'RESTART_TECHNICAL',
  'RESTART_STRATEGIC',
  'UPLOAD_CORRECTED',
];

const ROOM_REQUIRED: SessionEventType[] = ['RESTART_TECHNICAL', 'RESTART_STRATEGIC'];

/** Logging ahead of time would let a shift claim room time it has not worked. */
export const FUTURE_TOLERANCE_MINUTES = 2;

export interface EventContext {
  /** When the shift actually began, if it has been logged. */
  actualStartAt: Date | null;
  now: Date;
}

export function validateEvent(event: SessionEventInput, context: EventContext): void {
  if (REASON_REQUIRED.includes(event.eventType) && !event.reason?.trim()) {
    throw new SessionEventError('Sự kiện này bắt buộc nhập lý do.');
  }
  if (ROOM_REQUIRED.includes(event.eventType) && !event.roomId) {
    throw new SessionEventError('Restart phải gắn với phòng live đang chạy.');
  }
  if (event.eventType === 'HANDOVER_AGENCY_TEAM' && !event.relatedSessionId) {
    throw new SessionEventError('Bàn giao ca phải chọn ca nhận bàn giao.');
  }
  if (
    (event.eventType === 'HOST_CHANGED' || event.eventType === 'ASSISTANT_CHANGED') &&
    !event.toUserId
  ) {
    throw new SessionEventError('Đổi người phải chọn người thay thế.');
  }

  const tolerance = FUTURE_TOLERANCE_MINUTES * 60_000;
  if (event.occurredAt.getTime() > context.now.getTime() + tolerance) {
    throw new SessionEventError('Không log sự kiện ở thời điểm trong tương lai.');
  }
  if (context.actualStartAt && event.occurredAt.getTime() < context.actualStartAt.getTime()) {
    throw new SessionEventError('Thời điểm sự kiện sớm hơn lúc ca bắt đầu.');
  }
}

/**
 * Turns a logged event into the shift boundaries it implies.
 *
 * This is why the event log is an input to attribution rather than a record of
 * it (docs/01 §5): a handover logged at 13:04 cuts the room there, instead of
 * at whatever hour the schedule happened to say.
 */
export function timePatchesFor(event: SessionEventInput): SessionTimePatch[] {
  switch (event.eventType) {
    case 'SESSION_STARTED':
    case 'HANDOVER_FROM_INHOUSE':
      return [{ sessionId: event.sessionId, actualStartAt: event.occurredAt }];

    case 'SESSION_ENDED':
    case 'ENDED_EARLY':
    case 'HANDOVER_TO_INHOUSE':
      return [{ sessionId: event.sessionId, actualEndAt: event.occurredAt }];

    // One moment, two shifts: the outgoing one stops exactly where the incoming
    // one starts, so no room time falls between them or into both.
    case 'HANDOVER_AGENCY_TEAM':
      return [
        { sessionId: event.sessionId, actualEndAt: event.occurredAt },
        { sessionId: event.relatedSessionId!, actualStartAt: event.occurredAt },
      ];

    // A restart keeps one shift running across two rooms, and swapping a person
    // does not split a shift either — neither moves a boundary. Overtime is a
    // reason for a late finish, not the finish itself: that is SESSION_ENDED.
    case 'RESTART_TECHNICAL':
    case 'RESTART_STRATEGIC':
    case 'HOST_CHANGED':
    case 'ASSISTANT_CHANGED':
    case 'OVERTIME_EXTENDED':
    case 'UPLOAD_CORRECTED':
      return [];
  }
}

/** Ending a shift without the report leaves its figures unsplittable for good. */
export function requiresUploadAfter(eventType: SessionEventType): boolean {
  return (
    eventType === 'SESSION_ENDED' ||
    eventType === 'ENDED_EARLY' ||
    eventType === 'HANDOVER_AGENCY_TEAM' ||
    eventType === 'HANDOVER_TO_INHOUSE'
  );
}
