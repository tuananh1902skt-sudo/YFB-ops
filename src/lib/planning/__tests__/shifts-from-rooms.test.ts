import { describe, expect, it } from 'vitest';
import { groupRoomsIntoShifts, type RoomWindow } from '../shifts-from-rooms';

function room(id: string, start: string, end: string): RoomWindow {
  return {
    platformRoomId: id,
    startAt: new Date(`${start}+07:00`),
    endAt: new Date(`${end}+07:00`),
  };
}

const hhmm = (value: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);

describe('dựng ca từ room đã phát sóng', () => {
  it('ca bị restart giữa chừng vẫn là một ca', () => {
    // Đúng dữ liệu thật ngày 13/09: mất sóng lúc 19:57, bật lại lúc 20:02.
    const shifts = groupRoomsIntoShifts([
      room('a', '2026-09-13 19:03:00', '2026-09-13 19:57:00'),
      room('b', '2026-09-13 20:02:00', '2026-09-13 21:08:00'),
    ]);

    expect(shifts).toHaveLength(1);
    expect(shifts[0].roomIds).toEqual(['a', 'b']);
  });

  it('nghỉ dài giữa ca sáng và ca tối là hai ca khác nhau', () => {
    const shifts = groupRoomsIntoShifts([
      room('sang', '2026-09-13 10:59:00', '2026-09-13 13:59:00'),
      room('toi', '2026-09-13 19:03:00', '2026-09-13 21:08:00'),
    ]);

    expect(shifts).toHaveLength(2);
  });

  it('ca vắt qua nửa đêm thuộc về ngày bắt đầu', () => {
    const shifts = groupRoomsIntoShifts([
      room('x', '2026-09-14 19:43:00', '2026-09-15 00:34:00'),
    ]);

    expect(shifts[0].sessionDate).toBe('2026-09-14');
    expect(shifts[0].crossesMidnight).toBe(true);
  });

  it('khung giờ được làm tròn ra ngoài, không cắt vào thời gian đã live', () => {
    const shifts = groupRoomsIntoShifts([
      room('x', '2026-09-13 19:03:00', '2026-09-13 21:08:00'),
    ]);

    expect(hhmm(shifts[0].plannedStartAt)).toBe('19:00');
    expect(hhmm(shifts[0].plannedEndAt)).toBe('21:15');
    expect(shifts[0].plannedStartAt <= new Date('2026-09-13 19:03:00+07:00')).toBe(true);
    expect(shifts[0].plannedEndAt >= new Date('2026-09-13 21:08:00+07:00')).toBe(true);
  });

  it('ngưỡng ghép đọc từ tham số, không phải số cứng', () => {
    const rooms = [
      room('a', '2026-09-13 19:00:00', '2026-09-13 20:00:00'),
      room('b', '2026-09-13 20:45:00', '2026-09-13 21:30:00'),
    ];

    expect(groupRoomsIntoShifts(rooms).length).toBe(2);
    expect(
      groupRoomsIntoShifts(rooms, { maxGapMinutes: 60, roundMinutes: 15 }).length,
    ).toBe(1);
  });

  it('room lộn xộn thứ tự vẫn ghép đúng', () => {
    const shifts = groupRoomsIntoShifts([
      room('b', '2026-09-13 20:02:00', '2026-09-13 21:08:00'),
      room('a', '2026-09-13 19:03:00', '2026-09-13 19:57:00'),
    ]);

    expect(shifts[0].roomIds).toEqual(['a', 'b']);
  });

  it('không có room nào thì không dựng ca nào', () => {
    expect(groupRoomsIntoShifts([])).toEqual([]);
  });
});
