import { describe, expect, it } from 'vitest';
import { assignStaff, ScheduleConflictError, unassignStaff } from '../assign';
import { findConflicts } from '../conflicts';
import { MemoryAssignmentRepository } from '../memory-assignment-repository';
import { PlanningError, prepareSession } from '../session-form';

function at(value: string): Date {
  return new Date(`${value}+07:00`);
}

describe('tạo ca', () => {
  it('C9: ca qua nửa đêm giữ ngày bắt đầu, không tách theo ngày lịch', async () => {
    const prepared = prepareSession({
      brandId: 'brand-1',
      platformAccountId: 'account-1',
      plannedStartAt: at('2026-09-14 19:43:15'),
      plannedEndAt: at('2026-09-15 00:34:43'),
    });

    expect(prepared.sessionDate).toBe('2026-09-14');
  });

  it('ca bắt đầu đúng nửa đêm vẫn thuộc ngày hôm đó theo GMT+7', async () => {
    const prepared = prepareSession({
      brandId: 'brand-1',
      platformAccountId: 'account-1',
      plannedStartAt: at('2026-09-15 00:05:00'),
      plannedEndAt: at('2026-09-15 03:00:00'),
    });

    expect(prepared.sessionDate).toBe('2026-09-15');
  });

  it('giờ kết thúc không sau giờ bắt đầu thì từ chối', async () => {
    expect(() =>
      prepareSession({
        brandId: 'brand-1',
        platformAccountId: 'account-1',
        plannedStartAt: at('2026-09-14 19:00:00'),
        plannedEndAt: at('2026-09-14 19:00:00'),
      }),
    ).toThrow(PlanningError);
  });

  it('ca dài bất thường thì cảnh báo chứ không chặn', async () => {
    const prepared = prepareSession({
      brandId: 'brand-1',
      platformAccountId: 'account-1',
      plannedStartAt: at('2026-09-14 08:00:00'),
      plannedEndAt: at('2026-09-14 22:00:00'),
    });

    expect(prepared.warnings[0]).toContain('14.0 tiếng');
  });
});

describe('G4 — xung đột lịch', () => {
  const morning = {
    sessionId: 'ca-sang',
    sessionLabel: 'Franklin 10:00 → 13:00',
    role: 'HOST' as const,
    startAt: at('2026-09-09 10:00:00'),
    endAt: at('2026-09-09 13:00:00'),
  };

  it('ca nối liền kề không phải xung đột', async () => {
    const conflicts = findConflicts([morning], {
      startAt: at('2026-09-09 13:00:00'),
      endAt: at('2026-09-09 16:00:00'),
    });

    expect(conflicts).toHaveLength(0);
  });

  it('ca chồng giờ dù chỉ một phút vẫn là xung đột', async () => {
    const conflicts = findConflicts([morning], {
      startAt: at('2026-09-09 12:59:00'),
      endAt: at('2026-09-09 16:00:00'),
    });

    expect(conflicts).toHaveLength(1);
  });

  it('cùng người, khác vai trò, trùng giờ vẫn là xung đột', async () => {
    const conflicts = findConflicts([morning], {
      startAt: at('2026-09-09 11:00:00'),
      endAt: at('2026-09-09 12:00:00'),
    });

    expect(conflicts[0].role).toBe('HOST');
  });

  it('sửa chính ca đó thì không tự coi là xung đột với bản thân', async () => {
    const conflicts = findConflicts([morning], {
      startAt: at('2026-09-09 10:30:00'),
      endAt: at('2026-09-09 13:30:00'),
      excludeSessionId: 'ca-sang',
    });

    expect(conflicts).toHaveLength(0);
  });
});

describe('phân ca', () => {
  function scheduleWithClash() {
    const repo = new MemoryAssignmentRepository();
    repo.sessions.push(
      {
        id: 'ca-sang',
        brandId: 'brand-1',
        status: 'CONFIRMED',
        startAt: at('2026-09-09 10:00:00'),
        endAt: at('2026-09-09 13:00:00'),
      },
      {
        id: 'ca-chong',
        brandId: 'brand-2',
        status: 'CONFIRMED',
        startAt: at('2026-09-09 12:00:00'),
        endAt: at('2026-09-09 15:00:00'),
      },
    );
    repo.labels.set('ca-sang', 'Franklin 10:00 → 13:00');
    repo.staff.push({ sessionId: 'ca-sang', userId: 'khoi', role: 'HOST' });
    return repo;
  }

  it('cảnh báo trước khi lưu và nêu rõ ca nào chồng', async () => {
    const repo = scheduleWithClash();

    const failure = await assignStaff(repo, {
      sessionId: 'ca-chong',
      userId: 'khoi',
      role: 'HOST',
      actorId: 'operation',
    }).catch((error) => error);

    expect(failure).toBeInstanceOf(ScheduleConflictError);
    expect(failure.message).toContain('Franklin 10:00 → 13:00');
    // Nothing is written until someone decides.
    expect(repo.staff).toHaveLength(1);
  });

  it('vẫn phân được nếu Operation chấp nhận, kèm lý do vào audit log', async () => {
    const repo = scheduleWithClash();

    await assignStaff(repo, {
      sessionId: 'ca-chong',
      userId: 'khoi',
      role: 'HOST',
      actorId: 'operation',
      overrideReason: 'Hai brand cùng studio, host chạy song song 1 tiếng',
    });

    expect(repo.staff).toHaveLength(2);
    expect(repo.auditLogs[0]).toMatchObject({
      action: 'ASSIGNED_DESPITE_CONFLICT',
      reason: 'Hai brand cùng studio, host chạy song song 1 tiếng',
      actorId: 'operation',
    });
  });

  it('không phân người vào ca đã huỷ', async () => {
    const repo = scheduleWithClash();
    repo.sessions[1].status = 'CANCELLED';

    await expect(
      assignStaff(repo, { sessionId: 'ca-chong', userId: 'minh', role: 'ASSISTANT', actorId: 'op' }),
    ).rejects.toThrow(/đã huỷ/);
  });

  it('gỡ người khỏi ca bắt buộc có lý do và ghi audit log', async () => {
    const repo = scheduleWithClash();

    await expect(
      unassignStaff(repo, {
        sessionId: 'ca-sang',
        userId: 'khoi',
        role: 'HOST',
        actorId: 'op',
        reason: '  ',
      }),
    ).rejects.toThrow(PlanningError);

    await unassignStaff(repo, {
      sessionId: 'ca-sang',
      userId: 'khoi',
      role: 'HOST',
      actorId: 'op',
      reason: 'Host báo ốm',
    });

    expect(repo.staff).toHaveLength(0);
    expect(repo.auditLogs.at(-1)).toMatchObject({ action: 'UNASSIGNED', reason: 'Host báo ốm' });
  });
});
