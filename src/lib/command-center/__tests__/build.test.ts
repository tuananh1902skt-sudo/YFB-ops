import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { buildCommandCenter, type CommandCenterInput, type CommandCenterSession } from '../build';

const NOW = new Date('2026-09-18T15:30:00+07:00');

function session(overrides: Partial<CommandCenterSession> = {}): CommandCenterSession {
  return {
    sessionId: 's1',
    brandName: 'Franklin',
    startAt: new Date('2026-09-18T14:00:00+07:00'),
    endAt: new Date('2026-09-18T17:00:00+07:00'),
    staffNames: ['Khói'],
    status: 'LIVE',
    ownership: 'AGENCY',
    gmv: '30000000',
    targetGmv: '40000000',
    ...overrides,
  };
}

function input(overrides: Partial<CommandCenterInput> = {}): CommandCenterInput {
  return {
    today: '2026-09-18',
    now: NOW,
    sessions: [session()],
    counts: { unknownOwnership: 0, awaitingData: 0, pendingBookings: 0, unstaffedSlots: 0 },
    unallocatedGmv: new Decimal(0),
    ...overrides,
  };
}

function tile(center: ReturnType<typeof buildCommandCenter>, label: string) {
  return center.tiles.find((item) => item.label === label)!;
}

describe('trung tâm điều hành', () => {
  it('ca đang trong khung giờ được đánh dấu đang live', () => {
    const center = buildCommandCenter(input());

    expect(center.live).toHaveLength(1);
    expect(tile(center, 'Ca agency hôm nay').caveat).toBe('1 đang live');
  });

  it('ca đã kết thúc không còn tính là đang live', () => {
    const center = buildCommandCenter(
      input({ sessions: [session({ endAt: new Date('2026-09-18T15:00:00+07:00') })] }),
    );

    expect(center.live).toHaveLength(0);
  });

  it('ca đã huỷ không tính là đang live dù đang trong khung giờ', () => {
    const center = buildCommandCenter(input({ sessions: [session({ status: 'CANCELLED' })] }));

    expect(center.live).toHaveLength(0);
    expect(tile(center, 'Ca agency hôm nay').value).toBe('0');
  });

  it('ca chưa có người là việc gấp', () => {
    const center = buildCommandCenter(input({ sessions: [session({ staffNames: [] })] }));

    expect(center.alerts[0]).toMatchObject({ severity: 'critical' });
    expect(center.alerts[0].headline).toContain('chưa có người');
  });

  it('ca chưa có dữ liệu không bị cộng thành 0 vào GMV hôm nay', () => {
    const center = buildCommandCenter(
      input({
        sessions: [session(), session({ sessionId: 's2', gmv: null, targetGmv: null })],
      }),
    );

    expect(tile(center, 'GMV agency hôm nay').value).toBe('30.000.000 ₫');
    expect(tile(center, 'GMV agency hôm nay').caveat).toBe('1 ca chưa có dữ liệu');
  });

  it('chưa ca nào đặt target thì không báo 0 đồng', () => {
    const center = buildCommandCenter(input({ sessions: [session({ targetGmv: null })] }));

    expect(tile(center, 'Target hôm nay').value).toBe('—');
    expect(tile(center, 'Target hôm nay').caveat).toBe('Chưa ca nào đặt target');
  });

  it('việc gấp xếp trước việc thường', () => {
    const center = buildCommandCenter(
      input({
        counts: { unknownOwnership: 2, awaitingData: 3, pendingBookings: 1, unstaffedSlots: 0 },
      }),
    );

    expect(center.alerts.map((alert) => alert.severity)).toEqual([
      'critical',
      'warning',
      'warning',
    ]);
  });

  it('mỗi cảnh báo dẫn tới màn hình xử lý được nó', () => {
    const center = buildCommandCenter(
      input({
        sessions: [session({ staffNames: [] })],
        counts: { unknownOwnership: 1, awaitingData: 1, pendingBookings: 1, unstaffedSlots: 1 },
        unallocatedGmv: new Decimal('5000000'),
      }),
    );

    expect(center.alerts.map((alert) => alert.href)).toEqual([
      '/operations/ownership',
      '/operations',
      '/schedule',
      '/operations',
      '/operations/bookings',
      '/shifts',
    ]);
  });

  it('không ca không cảnh báo thì tự nhận là ngày yên', () => {
    expect(buildCommandCenter(input({ sessions: [] })).quiet).toBe(true);
  });

  it('có cảnh báo thì không phải ngày yên, dù không có ca nào', () => {
    const center = buildCommandCenter(
      input({
        sessions: [],
        counts: { unknownOwnership: 1, awaitingData: 0, pendingBookings: 0, unstaffedSlots: 0 },
      }),
    );

    expect(center.quiet).toBe(false);
  });

  it('ca brand tự live không bị cộng vào GMV agency, mà hiện cạnh nó', () => {
    const center = buildCommandCenter(
      input({
        sessions: [
          session(),
          session({ sessionId: 's2', ownership: 'BRAND_INHOUSE', gmv: '4100000', targetGmv: null }),
        ],
      }),
    );

    expect(tile(center, 'GMV agency hôm nay').value).toBe('30.000.000 ₫');
    expect(tile(center, 'GMV agency hôm nay').caveat).toContain('brand tự live thêm 4.100.000 ₫');
    expect(tile(center, 'Ca agency hôm nay').value).toBe('1');
  });

  it('ca brand tự live không có người không bị báo là thiếu người', () => {
    const center = buildCommandCenter(
      input({
        sessions: [session({ ownership: 'BRAND_INHOUSE', staffNames: [], targetGmv: null })],
      }),
    );

    expect(center.alerts.some((alert) => alert.headline.includes('chưa có người'))).toBe(false);
  });

  it('target hôm nay không tính target của ca ngoài agency', () => {
    const center = buildCommandCenter(
      input({
        sessions: [
          session({ targetGmv: '40000000' }),
          session({ sessionId: 's2', ownership: 'UNKNOWN', targetGmv: '99000000' }),
        ],
      }),
    );

    expect(tile(center, 'Target hôm nay').value).toBe('40.000.000 ₫');
  });
});
