import { toPlatformDateString } from '../parsing/primitives';

/**
 * Dựng lại khung ca từ các Room đã phát sóng thật.
 *
 * Dùng để khởi động một brand chưa có lịch sử trong hệ thống: ca đã live rồi
 * nhưng chưa ai nhập vào. **Không phải cách làm việc bình thường** — ca phải
 * được lên kế hoạch trước, rồi report mới khớp vào. Dựng ngược từ report chỉ
 * đúng cho lần nạp dữ liệu quá khứ đầu tiên, và người vận hành phải đối chiếu
 * lại với lịch thật của mình trước khi lưu.
 */

export interface RoomWindow {
  platformRoomId: string;
  startAt: Date;
  endAt: Date;
}

export interface ProposedShift {
  sessionDate: string;
  plannedStartAt: Date;
  plannedEndAt: Date;
  /** Room ghép vào ca này. Nhiều hơn một nghĩa là có restart giữa ca. */
  roomIds: string[];
  crossesMidnight: boolean;
}

/** Làm tròn xuống/lên tới bội số phút gần nhất. */
function roundTo(instant: Date, minutes: number, direction: 'down' | 'up'): Date {
  const step = minutes * 60_000;
  const value = instant.getTime();
  return new Date(direction === 'down' ? Math.floor(value / step) * step : Math.ceil(value / step) * step);
}

export interface GroupOptions {
  /** Hai room cách nhau dưới ngưỡng này coi là cùng một ca bị restart. */
  maxGapMinutes: number;
  /** Bước làm tròn khung giờ kế hoạch, để khung trông như lịch người đặt. */
  roundMinutes: number;
}

export const DEFAULT_GROUP_OPTIONS: GroupOptions = { maxGapMinutes: 30, roundMinutes: 15 };

/**
 * Gộp các room liền nhau thành một ca.
 *
 * Một ca bị mất mạng rồi bật lại tạo ra hai room cách nhau vài phút — đó vẫn là
 * một ca của agency (docs/01 §6). Ngược lại, khoảng nghỉ dài giữa sáng và tối là
 * hai ca khác nhau.
 */
export function groupRoomsIntoShifts(
  rooms: RoomWindow[],
  options: GroupOptions = DEFAULT_GROUP_OPTIONS,
): ProposedShift[] {
  const sorted = [...rooms].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const groups: RoomWindow[][] = [];

  for (const room of sorted) {
    const current = groups[groups.length - 1];
    const previous = current?.[current.length - 1];
    const gapMinutes = previous
      ? (room.startAt.getTime() - previous.endAt.getTime()) / 60_000
      : Number.POSITIVE_INFINITY;

    if (current && gapMinutes <= options.maxGapMinutes) current.push(room);
    else groups.push([room]);
  }

  return groups.map((group) => {
    const start = roundTo(group[0].startAt, options.roundMinutes, 'down');
    const lastEnd = group.reduce(
      (latest, room) => (room.endAt > latest ? room.endAt : latest),
      group[0].endAt,
    );
    const end = roundTo(lastEnd, options.roundMinutes, 'up');

    return {
      // Ca vắt qua nửa đêm vẫn thuộc về ngày nó bắt đầu (docs/01 §12).
      sessionDate: toPlatformDateString(start),
      plannedStartAt: start,
      plannedEndAt: end,
      roomIds: group.map((room) => room.platformRoomId),
      crossesMidnight: toPlatformDateString(start) !== toPlatformDateString(end),
    };
  });
}
