import { describe, expect, it } from 'vitest';
import { buildSchedule, platformToday, weekDates, type ScheduleSessionInput } from '../schedule-view';

function session(overrides: Partial<ScheduleSessionInput> = {}): ScheduleSessionInput {
  return {
    sessionId: 'session-1',
    brandName: 'Franklin',
    sessionDate: '2026-09-14',
    status: 'CONFIRMED',
    ownership: 'AGENCY',
    plannedStartAt: '2026-09-14T19:43:15+07:00',
    plannedEndAt: '2026-09-15T00:34:43+07:00',
    targetGmv: '30000000',
    hostNames: ['Khói'],
    assistantNames: [],
    needs: [
      { role: 'HOST', headcount: 1 },
      { role: 'ASSISTANT', headcount: 1 },
    ],
    ...overrides,
  };
}

describe('lịch live', () => {
  it('tuần bắt đầu từ thứ hai', async () => {
    expect(weekDates('2026-09-17')).toEqual([
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ]);
  });

  it('ca qua nửa đêm chỉ hiện một lần, ở ngày bắt đầu', async () => {
    const days = buildSchedule([session()], '2026-09-14', '2026-09-17');
    const withSessions = days.filter((day) => day.sessions.length > 0);

    expect(withSessions).toHaveLength(1);
    expect(withSessions[0].date).toBe('2026-09-14');
    // The next day is spelled out rather than implied.
    expect(withSessions[0].sessions[0].timeLabel).toBe('19:43 → 00:34 (15/09)');
  });

  it('nêu rõ còn thiếu vai trò nào', async () => {
    const days = buildSchedule([session()], '2026-09-14', '2026-09-17');

    expect(days[0].sessions[0].missingLabel).toBe('Còn thiếu 1 trợ live');
  });

  it('ca đã đủ người thì không hiện cảnh báo thiếu', async () => {
    const days = buildSchedule(
      [session({ assistantNames: ['Minh'] })],
      '2026-09-14',
      '2026-09-17',
    );

    expect(days[0].sessions[0].missingLabel).toBeNull();
  });

  it('ca brand tự live nói rõ bằng chữ, không chỉ bằng màu', async () => {
    const days = buildSchedule(
      [session({ ownership: 'BRAND_INHOUSE' })],
      '2026-09-14',
      '2026-09-17',
    );

    expect(days[0].sessions[0].tone).toBe('outside');
    expect(days[0].sessions[0].statusLabel).toBe('Brand tự live');
  });

  it('ca chưa rõ ownership hiện đúng nhãn đó, không hiện trạng thái dữ liệu', async () => {
    const days = buildSchedule(
      [session({ ownership: 'UNKNOWN', status: 'DATA_PARTIAL' })],
      '2026-09-14',
      '2026-09-17',
    );

    expect(days[0].sessions[0].statusLabel).toBe('Chưa rõ ai vận hành');
  });

  it('chỉ ra đúng vai trò đang thiếu để form phân ca mở sẵn vai trò đó', async () => {
    const days = buildSchedule([session()], '2026-09-14', '2026-09-17');

    expect(days[0].sessions[0].missingRoles).toEqual(['ASSISTANT']);
  });

  it('hôm nay tính theo GMT+7, không theo giờ máy chủ', async () => {
    // 18:30 UTC on the 16th is already past midnight in Vietnam.
    expect(platformToday(new Date('2026-09-16T18:30:00Z'))).toBe('2026-09-17');
  });
});
