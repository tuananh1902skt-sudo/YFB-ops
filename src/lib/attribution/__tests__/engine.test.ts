import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import type { CumulativeMetrics } from '../../parsing/live-performance';
import { assignSegments, computeRoomSegments, computeSessionResult } from '../engine';
import type { RoomInput, SessionWindow } from '../types';

/** All figures below come from the real export (docs/07 §1). */

function metrics(values: Partial<Record<keyof CumulativeMetrics, number | string>> = {}): CumulativeMetrics {
  const base: CumulativeMetrics = {
    gmv: null,
    itemsSold: null,
    orders: null,
    skuOrders: null,
    customers: null,
    views: null,
    impressions: null,
    productImpressions: null,
    productClicks: null,
    newFollowers: null,
    comments: null,
    shares: null,
    likes: null,
  };

  for (const [key, value] of Object.entries(values)) {
    if (key === 'gmv') base.gmv = new Decimal(value as string);
    else (base as Record<string, unknown>)[key] = Number(value);
  }
  return base;
}

const at = (iso: string) => new Date(`${iso}+07:00`);

function session(sessionId: string, start: string, end: string): SessionWindow {
  return { sessionId, startAt: at(start), endAt: at(end) };
}

describe('C1 — ca đơn giản, 1 room = 1 ca', () => {
  it('lấy trọn snapshot đầu tiên làm kết quả ca', () => {
    const room: RoomInput = {
      roomId: '7683505862182275861',
      startAt: at('2026-09-09T19:07:06'),
      snapshots: [
        { snapshotId: 's1', endAt: at('2026-09-09T22:07:37'), metrics: metrics({ gmv: '30329959.79', orders: 40 }) },
      ],
    };

    const assignments = assignSegments(computeRoomSegments(room), [session('ca-toi', '2026-09-09T19:00:00', '2026-09-09T22:00:00')]);
    const result = computeSessionResult('ca-toi', assignments);

    expect(result.method).toBe('FULL_SNAPSHOT');
    expect(result.metrics.gmv?.toFixed(2)).toBe('30329959.79');
    expect(result.confidence).toBe('HIGH');
    expect(result.liveMinutes).toBeCloseTo(180.52, 1);
  });
});

describe('C2 — ca nối: 1 room, 2 ca', () => {
  const room: RoomInput = {
    roomId: '7683365340126808852',
    startAt: at('2026-09-09T10:01:57'),
    snapshots: [
      { snapshotId: 's1', endAt: at('2026-09-09T13:00:00'), metrics: metrics({ gmv: '30000000.00', orders: 30, productClicks: 900 }) },
      { snapshotId: 's2', endAt: at('2026-09-09T16:02:48'), metrics: metrics({ gmv: '77025508.90', orders: 82, productClicks: 2400 }) },
    ],
  };
  const sessions = [
    session('ca-sang', '2026-09-09T10:00:00', '2026-09-09T13:00:00'),
    session('ca-chieu', '2026-09-09T13:00:00', '2026-09-09T16:00:00'),
  ];

  it('ca sáng lấy trọn snapshot đầu', () => {
    const result = computeSessionResult('ca-sang', assignSegments(computeRoomSegments(room), sessions));

    expect(result.method).toBe('FULL_SNAPSHOT');
    expect(result.metrics.gmv?.toFixed(2)).toBe('30000000.00');
    expect(result.confidence).toBe('HIGH');
  });

  it('ca chiều = hiệu hai snapshot, không phải toàn bộ số cộng dồn', () => {
    const result = computeSessionResult('ca-chieu', assignSegments(computeRoomSegments(room), sessions));

    expect(result.method).toBe('SNAPSHOT_DELTA');
    expect(result.metrics.gmv?.toFixed(2)).toBe('47025508.90');
    expect(result.metrics.orders).toBe(52);
    expect(result.liveMinutes).toBeCloseTo(182.8, 1);
  });

  it('tổng hai ca đúng bằng số cộng dồn cuối cùng, không thừa không thiếu', () => {
    const assignments = assignSegments(computeRoomSegments(room), sessions);
    const morning = computeSessionResult('ca-sang', assignments);
    const afternoon = computeSessionResult('ca-chieu', assignments);

    const total = morning.metrics.gmv!.plus(afternoon.metrics.gmv!);
    expect(total.toFixed(2)).toBe('77025508.90');
  });
});

describe('C3 — ca nối ba ca liên tiếp', () => {
  it('mỗi ca lấy đúng phần của mình', () => {
    const room: RoomInput = {
      roomId: '7683365340126808852',
      startAt: at('2026-09-09T10:00:00'),
      snapshots: [
        { snapshotId: 's1', endAt: at('2026-09-09T12:00:00'), metrics: metrics({ gmv: '10000000' }) },
        { snapshotId: 's2', endAt: at('2026-09-09T14:00:00'), metrics: metrics({ gmv: '35000000' }) },
        { snapshotId: 's3', endAt: at('2026-09-09T16:00:00'), metrics: metrics({ gmv: '77025508.90' }) },
      ],
    };
    const sessions = [
      session('ca-1', '2026-09-09T10:00:00', '2026-09-09T12:00:00'),
      session('ca-2', '2026-09-09T12:00:00', '2026-09-09T14:00:00'),
      session('ca-3', '2026-09-09T14:00:00', '2026-09-09T16:00:00'),
    ];

    const assignments = assignSegments(computeRoomSegments(room), sessions);
    const results = ['ca-1', 'ca-2', 'ca-3'].map((id) => computeSessionResult(id, assignments));

    expect(results.map((r) => r.metrics.gmv?.toFixed(2))).toEqual(['10000000.00', '25000000.00', '42025508.90']);
    const total = results.reduce((sum, r) => sum.plus(r.metrics.gmv!), new Decimal(0));
    expect(total.toFixed(2)).toBe('77025508.90');
  });
});

describe('C4 — restart: 2 room, 1 ca', () => {
  it('cộng các đoạn room lại thay vì trừ snapshot', () => {
    const roomA: RoomInput = {
      roomId: '7682391002071436053',
      startAt: at('2026-09-06T19:00:52'),
      snapshots: [{ snapshotId: 'a1', endAt: at('2026-09-06T20:10:06'), metrics: metrics({ gmv: '6065697.98', orders: 8 }) }],
    };
    const roomB: RoomInput = {
      roomId: '7682409863158401812',
      startAt: at('2026-09-06T20:14:01'),
      snapshots: [{ snapshotId: 'b1', endAt: at('2026-09-06T22:07:29'), metrics: metrics({ gmv: '11155600.01', orders: 14 }) }],
    };
    const sessions = [session('ca-toi', '2026-09-06T19:00:00', '2026-09-06T22:00:00')];

    const assignments = assignSegments(
      [...computeRoomSegments(roomA), ...computeRoomSegments(roomB)],
      sessions,
    );
    const result = computeSessionResult('ca-toi', assignments);

    expect(result.method).toBe('ROOM_SUM');
    expect(result.metrics.gmv?.toFixed(2)).toBe('17221297.99');
    expect(result.metrics.orders).toBe(22);
    expect(result.roomIds).toHaveLength(2);
    // 4 phút gián đoạn giữa hai room không được tính vào giờ live
    expect(result.liveMinutes).toBeCloseTo(182.7, 1);
    expect(result.confidence).toBe('MEDIUM');
  });
});

describe('C6 — thiếu snapshot ở ranh giới bàn giao', () => {
  const room: RoomInput = {
    roomId: '7683365340126808852',
    startAt: at('2026-09-09T10:01:57'),
    snapshots: [
      { snapshotId: 's-cuoi', endAt: at('2026-09-09T16:02:48'), metrics: metrics({ gmv: '77025508.90', orders: 82 }) },
    ],
  };
  const sessions = [
    session('ca-sang', '2026-09-09T10:00:00', '2026-09-09T13:00:00'),
    session('ca-chieu', '2026-09-09T13:00:00', '2026-09-09T16:00:00'),
  ];

  it('không chia đôi, không gán hết cho một ca', () => {
    const assignments = assignSegments(computeRoomSegments(room), sessions);
    const morning = computeSessionResult('ca-sang', assignments);
    const afternoon = computeSessionResult('ca-chieu', assignments);

    for (const result of [morning, afternoon]) {
      expect(result.method).toBe('SHARED_UNALLOCATED');
      expect(result.metrics.gmv).toBeNull();
      expect(result.liveMinutes).toBeNull();
      expect(result.confidence).toBe('LOW');
    }
    expect(morning.sharedWithSessionIds).toContain('ca-chieu');
    expect(afternoon.sharedWithSessionIds).toContain('ca-sang');
  });

  it('phần GMV chưa quy kết vẫn nhìn thấy được để Operation xử lý', () => {
    const assignments = assignSegments(computeRoomSegments(room), sessions);
    const shared = assignments.filter((a) => a.kind === 'SHARED_UNALLOCATED');

    expect(shared).toHaveLength(1);
    expect(shared[0].segment.metrics.gmv?.toFixed(2)).toBe('77025508.90');
  });
});

describe('C7 — hiệu số âm', () => {
  it('không ghi số, chuyển sang cần rà soát', () => {
    const room: RoomInput = {
      roomId: '7683365340126808852',
      startAt: at('2026-09-09T10:00:00'),
      snapshots: [
        { snapshotId: 's1', endAt: at('2026-09-09T13:00:00'), metrics: metrics({ gmv: '50000000' }) },
        { snapshotId: 's2', endAt: at('2026-09-09T16:00:00'), metrics: metrics({ gmv: '30000000' }) },
      ],
    };
    const sessions = [
      session('ca-sang', '2026-09-09T10:00:00', '2026-09-09T13:00:00'),
      session('ca-chieu', '2026-09-09T13:00:00', '2026-09-09T16:00:00'),
    ];

    const assignments = assignSegments(computeRoomSegments(room), sessions);
    const afternoon = computeSessionResult('ca-chieu', assignments);

    expect(afternoon.issues).toContain('NEGATIVE_DELTA');
    expect(afternoon.metrics.gmv).toBeNull();
    expect(afternoon.confidence).toBe('NEEDS_REVIEW');
  });
});

describe('C9 — ca qua nửa đêm', () => {
  it('tính đủ thời lượng, không cắt theo ngày lịch', () => {
    const room: RoomInput = {
      roomId: '7685370600542391060',
      startAt: at('2026-09-14T19:43:15'),
      snapshots: [{ snapshotId: 's1', endAt: at('2026-09-15T00:34:43'), metrics: metrics({ gmv: '18132599.93' }) }],
    };

    const assignments = assignSegments(computeRoomSegments(room), [
      session('ca-toi-14', '2026-09-14T19:30:00', '2026-09-15T00:45:00'),
    ]);
    const result = computeSessionResult('ca-toi-14', assignments);

    expect(result.liveMinutes).toBeCloseTo(291.5, 1);
    expect(result.metrics.gmv?.toFixed(2)).toBe('18132599.93');
  });
});

describe('D1 — đoạn live không khớp ca nào', () => {
  it('để trạng thái chưa xác định thay vì gán bừa cho ca gần nhất', () => {
    const room: RoomInput = {
      roomId: '7683009148875361045',
      startAt: at('2026-09-08T10:59:37'),
      snapshots: [{ snapshotId: 's1', endAt: at('2026-09-08T12:10:19'), metrics: metrics({ gmv: '3375835.00' }) }],
    };

    const assignments = assignSegments(computeRoomSegments(room), [
      session('ca-toi', '2026-09-08T19:00:00', '2026-09-08T22:00:00'),
    ]);

    expect(assignments[0].kind).toBe('UNMATCHED');
    const evening = computeSessionResult('ca-toi', assignments);
    expect(evening.metrics.gmv).toBeNull();
  });
});

describe('B1 — snapshot trùng thời điểm', () => {
  it('đánh dấu bất thường thay vì cộng dồn hai lần', () => {
    const room: RoomInput = {
      roomId: '7683505862182275861',
      startAt: at('2026-09-09T19:07:06'),
      snapshots: [
        { snapshotId: 's1', endAt: at('2026-09-09T22:07:37'), metrics: metrics({ gmv: '30329959.79' }) },
        { snapshotId: 's2', endAt: at('2026-09-09T22:07:37'), metrics: metrics({ gmv: '30329959.79' }) },
      ],
    };

    const segments = computeRoomSegments(room);
    expect(segments[1].issues).toContain('DUPLICATE_SNAPSHOT_TIME');
    expect(segments[1].metrics.gmv?.toFixed(2)).toBe('0.00');
  });
});
