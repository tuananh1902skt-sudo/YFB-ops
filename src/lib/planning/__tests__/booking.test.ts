import { describe, expect, it } from 'vitest';
import { approveBooking, cancelOwnBooking, registerForSlot, rejectBooking } from '../book';
import { MemoryBookingRepository } from '../memory-booking-repository';
import { PlanningError } from '../session-form';

const OPERATION = 'operation-1';

function at(value: string): Date {
  return new Date(`${value}+07:00`);
}

const NOW = at('2026-09-08 09:00:00');

function openShift(headcount = 1) {
  const repo = new MemoryBookingRepository();
  repo.sessions.push({
    id: 'ca-toi',
    brandId: 'brand-1',
    status: 'OPEN_FOR_BOOKING',
    startAt: at('2026-09-09 19:00:00'),
    endAt: at('2026-09-09 22:00:00'),
  });
  repo.slots.push({
    slotId: 'slot-host',
    sessionId: 'ca-toi',
    brandId: 'brand-1',
    role: 'HOST',
    headcount,
    startAt: at('2026-09-09 19:00:00'),
    endAt: at('2026-09-09 22:00:00'),
    status: 'OPEN',
  });
  return repo;
}

describe('đăng ký ca', () => {
  it('đăng ký xong ca chuyển sang chờ duyệt', async () => {
    const repo = openShift();

    const result = await registerForSlot(repo, 'slot-host', 'khoi', null, NOW);

    expect(result.conflicts).toHaveLength(0);
    expect(repo.bookings[0]).toMatchObject({ userId: 'khoi', status: 'REGISTERED' });
    expect(repo.sessionStatuses.get('ca-toi')).toBe('PENDING_APPROVAL');
    // Registering is not being staffed: nobody is on the shift yet.
    expect(repo.staff).toHaveLength(0);
  });

  it('không đăng ký hai lần cùng một ca', async () => {
    const repo = openShift();
    await registerForSlot(repo, 'slot-host', 'khoi', null, NOW);

    await expect(registerForSlot(repo, 'slot-host', 'khoi', null, NOW)).rejects.toThrow(
      /đã đăng ký ca này rồi/,
    );
  });

  it('ca đã đủ người thì không nhận đăng ký mới', async () => {
    const repo = openShift();
    await registerForSlot(repo, 'slot-host', 'khoi', null, NOW);
    await approveBooking(repo, { slotId: 'slot-host', userId: 'khoi', actorId: OPERATION });

    await expect(registerForSlot(repo, 'slot-host', 'linh', null, NOW)).rejects.toThrow(
      /đã đủ người/,
    );
  });

  it('ca đã bắt đầu thì không đăng ký được nữa', async () => {
    const repo = openShift();

    await expect(
      registerForSlot(repo, 'slot-host', 'khoi', null, at('2026-09-09 20:00:00')),
    ).rejects.toThrow(/đã bắt đầu/);
  });

  it('trùng giờ lịch cá nhân thì cảnh báo nhưng vẫn cho đăng ký', async () => {
    const repo = openShift();
    repo.sessions.push({
      id: 'ca-khac',
      brandId: 'brand-2',
      status: 'CONFIRMED',
      startAt: at('2026-09-09 20:00:00'),
      endAt: at('2026-09-09 23:00:00'),
    });
    repo.labels.set('ca-khac', 'Brand khác 20:00 → 23:00');
    repo.staff.push({ sessionId: 'ca-khac', userId: 'khoi', role: 'HOST' });

    const result = await registerForSlot(repo, 'slot-host', 'khoi', null, NOW);

    expect(result.conflicts.map((conflict) => conflict.sessionLabel)).toEqual([
      'Brand khác 20:00 → 23:00',
    ]);
    expect(repo.bookings).toHaveLength(1);
  });
});

describe('duyệt đăng ký', () => {
  it('duyệt là lúc người đó thật sự được gán vào ca', async () => {
    const repo = openShift();
    await registerForSlot(repo, 'slot-host', 'khoi', null, NOW);

    const result = await approveBooking(repo, {
      slotId: 'slot-host',
      userId: 'khoi',
      actorId: OPERATION,
    });

    expect(repo.staff).toEqual([{ sessionId: 'ca-toi', userId: 'khoi', role: 'HOST' }]);
    expect(repo.bookings[0].status).toBe('APPROVED');
    expect(result.sessionConfirmed).toBe(true);
    expect(repo.sessionStatuses.get('ca-toi')).toBe('CONFIRMED');
  });

  it('còn slot chưa đủ người thì ca chưa chốt', async () => {
    const repo = openShift(2);
    await registerForSlot(repo, 'slot-host', 'khoi', null, NOW);

    const result = await approveBooking(repo, {
      slotId: 'slot-host',
      userId: 'khoi',
      actorId: OPERATION,
    });

    expect(result.sessionConfirmed).toBe(false);
    expect(repo.sessionStatuses.get('ca-toi')).toBe('PENDING_APPROVAL');
  });

  it('duyệt vào ca trùng giờ bị chặn, trừ khi Operation nêu lý do', async () => {
    const repo = openShift();
    repo.sessions.push({
      id: 'ca-khac',
      brandId: 'brand-2',
      status: 'CONFIRMED',
      startAt: at('2026-09-09 20:00:00'),
      endAt: at('2026-09-09 23:00:00'),
    });
    repo.labels.set('ca-khac', 'Brand khác 20:00 → 23:00');
    repo.staff.push({ sessionId: 'ca-khac', userId: 'khoi', role: 'HOST' });
    await registerForSlot(repo, 'slot-host', 'khoi', null, NOW);

    await expect(
      approveBooking(repo, { slotId: 'slot-host', userId: 'khoi', actorId: OPERATION }),
    ).rejects.toThrow(/trùng giờ/);
    expect(repo.bookings[0].status).toBe('REGISTERED');

    await approveBooking(repo, {
      slotId: 'slot-host',
      userId: 'khoi',
      actorId: OPERATION,
      overrideReason: 'Hai brand cùng studio',
    });

    expect(repo.bookings[0].status).toBe('APPROVED');
    expect(repo.auditLogs[0].action).toBe('ASSIGNED_DESPITE_CONFLICT');
  });

  it('không duyệt quá số người ca cần', async () => {
    const repo = openShift();
    await registerForSlot(repo, 'slot-host', 'khoi', null, NOW);
    await registerForSlot(repo, 'slot-host', 'linh', null, NOW);
    await approveBooking(repo, { slotId: 'slot-host', userId: 'khoi', actorId: OPERATION });

    await expect(
      approveBooking(repo, { slotId: 'slot-host', userId: 'linh', actorId: OPERATION }),
    ).rejects.toThrow(/đã đủ người/);
  });

  it('từ chối bắt buộc có lý do và ghi audit log', async () => {
    const repo = openShift();
    await registerForSlot(repo, 'slot-host', 'khoi', null, NOW);

    await expect(
      rejectBooking(repo, { slotId: 'slot-host', userId: 'khoi', actorId: OPERATION, reason: ' ' }),
    ).rejects.toThrow(PlanningError);

    await rejectBooking(repo, {
      slotId: 'slot-host',
      userId: 'khoi',
      actorId: OPERATION,
      reason: 'Ca này cần host có kinh nghiệm ngành hàng',
    });

    expect(repo.bookings[0].status).toBe('REJECTED');
    expect(repo.auditLogs[0]).toMatchObject({
      action: 'BOOKING_REJECTED',
      reason: 'Ca này cần host có kinh nghiệm ngành hàng',
    });
  });
});

describe('tự huỷ đăng ký', () => {
  it('huỷ được khi chưa duyệt', async () => {
    const repo = openShift();
    await registerForSlot(repo, 'slot-host', 'khoi', null, NOW);

    await cancelOwnBooking(repo, 'slot-host', 'khoi');

    expect(repo.bookings[0].status).toBe('CANCELLED');
    // The slot frees up again for someone else.
    await expect(registerForSlot(repo, 'slot-host', 'linh', null, NOW)).resolves.toBeDefined();
  });

  it('đã duyệt rồi thì phải qua Operation, không tự huỷ', async () => {
    const repo = openShift();
    await registerForSlot(repo, 'slot-host', 'khoi', null, NOW);
    await approveBooking(repo, { slotId: 'slot-host', userId: 'khoi', actorId: OPERATION });

    await expect(cancelOwnBooking(repo, 'slot-host', 'khoi')).rejects.toThrow(/Báo Operation/);
    expect(repo.staff).toHaveLength(1);
  });
});
