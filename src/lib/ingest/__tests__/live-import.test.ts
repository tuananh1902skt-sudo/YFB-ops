import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { parseLivePerformanceWorkbook } from '../../parsing/live-performance';
import { buildLiveWorkbook, type LiveRowInput } from '../../parsing/__tests__/fixtures';
import { importLivePerformance, type LiveImportReport } from '../live-import';
import { MemoryRepository } from '../memory-repository';
import type { ImportContext } from '../types';

const ACCOUNT = 'account-1';
const ROOM_LONG = '7683365340126808852';
const ROOM_A = '7683365340126808853';
const ROOM_B = '7683365340126808854';

function context(fileHash: string): ImportContext {
  return {
    platformAccountId: ACCOUNT,
    uploadedBy: 'user-1',
    fileName: `Creator-Live-Performance_${fileHash}.xlsx`,
    fileHash,
    storagePath: `imports/${fileHash}.xlsx`,
  };
}

async function upload(
  repo: MemoryRepository,
  fileHash: string,
  rows: LiveRowInput[],
): Promise<LiveImportReport> {
  const parsed = await parseLivePerformanceWorkbook(await buildLiveWorkbook(rows));
  return importLivePerformance(repo, context(fileHash), parsed);
}

function at(value: string): Date {
  return new Date(`${value}+07:00`);
}

/** The handed-over room from docs/07 §C2, as the assistant would upload it. */
const morningSnapshot: LiveRowInput = {
  roomId: ROOM_LONG,
  start: '2026-09-09 10:01:57',
  end: '2026-09-09 13:00:00',
  duration: '2h58m',
  gmv: '30,000,000.00₫',
  orders: '30',
};
const afternoonSnapshot: LiveRowInput = {
  roomId: ROOM_LONG,
  start: '2026-09-09 10:01:57',
  end: '2026-09-09 16:02:48',
  duration: '6h00m',
  gmv: '77,025,508.90₫',
  orders: '82',
};

function handoverSessions(repo: MemoryRepository) {
  const morning = repo.addSession({
    id: 'session-morning',
    brandId: 'brand-1',
    startAt: at('2026-09-09 10:00:00'),
    endAt: at('2026-09-09 13:00:00'),
  });
  const afternoon = repo.addSession({
    id: 'session-afternoon',
    brandId: 'brand-1',
    startAt: at('2026-09-09 13:00:00'),
    endAt: at('2026-09-09 16:00:00'),
  });
  return { morning, afternoon };
}

describe('nhóm B — import và chống trùng', () => {
  it('B1: upload lại đúng file đó không tạo thêm snapshot', async () => {
    const repo = new MemoryRepository();
    handoverSessions(repo);

    await upload(repo, 'hash-1', [morningSnapshot]);
    const gmvBefore = repo.currentFor('session-morning')[0].metrics.gmv!.toString();

    const second = await upload(repo, 'hash-1', [morningSnapshot]);

    expect(second.status).toBe('DUPLICATE_FILE');
    expect(repo.snapshots).toHaveLength(1);
    expect(repo.currentFor('session-morning')[0].metrics.gmv!.toString()).toBe(gmvBefore);
  });

  it('B2: file khác chứa cùng Room và cùng End Time thì không cộng dồn hai lần', async () => {
    const repo = new MemoryRepository();
    handoverSessions(repo);

    await upload(repo, 'hash-per-ca', [morningSnapshot]);
    // The monthly bulk export repeats the same room with the same End Time.
    const bulk = await upload(repo, 'hash-bulk', [morningSnapshot]);

    expect(bulk.status).toBe('IMPORTED');
    if (bulk.status !== 'IMPORTED') return;
    expect(bulk.snapshotsCreated).toBe(0);
    expect(bulk.skippedSnapshots).toEqual([
      {
        platformRoomId: ROOM_LONG,
        snapshotEndAt: at('2026-09-09 13:00:00'),
        reason: 'ALREADY_IMPORTED',
      },
    ]);
    expect(repo.snapshots).toHaveLength(1);
    expect(repo.currentFor('session-morning')[0].metrics.gmv!.toString()).toBe('30000000');
  });

  it('B3: file bulk tạo snapshot đuôi, phần chênh lệch thành đoạn chưa xác định', async () => {
    const repo = new MemoryRepository();
    // Only the morning shift is booked; nothing covers the afternoon.
    repo.addSession({
      id: 'session-morning',
      brandId: 'brand-1',
      startAt: at('2026-09-09 10:00:00'),
      endAt: at('2026-09-09 13:00:00'),
    });

    await upload(repo, 'hash-per-ca', [morningSnapshot]);
    const bulk = await upload(repo, 'hash-bulk', [morningSnapshot, afternoonSnapshot]);

    expect(bulk.status).toBe('IMPORTED');
    if (bulk.status !== 'IMPORTED') return;
    expect(bulk.snapshotsCreated).toBe(1);

    // The morning shift keeps exactly what it produced.
    expect(repo.currentFor('session-morning')[0].metrics.gmv!.toString()).toBe('30000000');

    const discovered = repo.sessions.filter((session) => session.ownership === 'UNKNOWN');
    expect(discovered).toHaveLength(1);
    expect(discovered[0].startAt).toEqual(at('2026-09-09 13:00:00'));
    expect(discovered[0].endAt).toEqual(at('2026-09-09 16:02:48'));
    expect(repo.currentFor(discovered[0].id)[0].metrics.gmv!.toString()).toBe('47025508.9');
  });
});

describe('nhóm C — attribution qua tầng lưu trữ', () => {
  it('C2: ca nối trong cùng một room, tổng hai ca đúng bằng số cộng dồn cuối', async () => {
    const repo = new MemoryRepository();
    handoverSessions(repo);

    await upload(repo, 'hash-ca-sang', [morningSnapshot]);
    await upload(repo, 'hash-ca-chieu', [morningSnapshot, afternoonSnapshot]);

    const morning = repo.currentFor('session-morning')[0];
    const afternoon = repo.currentFor('session-afternoon')[0];

    expect(morning.method).toBe('FULL_SNAPSHOT');
    expect(morning.metrics.gmv!.toString()).toBe('30000000');
    expect(morning.confidence).toBe('HIGH');

    expect(afternoon.method).toBe('SNAPSHOT_DELTA');
    expect(afternoon.metrics.gmv!.toString()).toBe('47025508.9');
    expect(afternoon.metrics.orders).toBe(52);
    expect(afternoon.durationMinutes).toBeCloseTo(182.8, 2);

    expect(morning.metrics.gmv!.plus(afternoon.metrics.gmv!).toString()).toBe('77025508.9');
  });

  it('C4: restart tạo hai dòng ROOM_SUM cho cùng một ca', async () => {
    const repo = new MemoryRepository();
    repo.addSession({
      id: 'session-evening',
      brandId: 'brand-1',
      startAt: at('2026-09-06 19:00:00'),
      endAt: at('2026-09-06 22:00:00'),
    });

    await upload(repo, 'hash-restart', [
      {
        roomId: ROOM_A,
        start: '2026-09-06 19:00:00',
        end: '2026-09-06 20:09:00',
        duration: '1h09m',
        gmv: '6,065,697.98₫',
      },
      {
        roomId: ROOM_B,
        start: '2026-09-06 20:13:00',
        end: '2026-09-06 22:06:00',
        duration: '1h53m',
        gmv: '11,155,600.01₫',
      },
    ]);

    const rows = repo.currentFor('session-evening');
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.method === 'ROOM_SUM')).toBe(true);
    expect(rows.every((row) => row.confidence === 'MEDIUM')).toBe(true);

    const gmv = rows.reduce((sum, row) => sum.plus(row.metrics.gmv!), new Decimal(0));
    expect(gmv.toString()).toBe('17221297.99');
    // The 4 minutes between the two rooms are not counted as airtime.
    expect(rows.reduce((sum, row) => sum + row.durationMinutes!, 0)).toBe(182);
  });

  it('C6: thiếu snapshot ranh giới thì không ca nào nhận số', async () => {
    const repo = new MemoryRepository();
    handoverSessions(repo);

    await upload(repo, 'hash-cuoi-ngay', [afternoonSnapshot]);

    for (const sessionId of ['session-morning', 'session-afternoon']) {
      const row = repo.currentFor(sessionId)[0];
      expect(row.method).toBe('SHARED_UNALLOCATED');
      expect(row.metrics.gmv).toBeNull();
      expect(row.confidence).toBe('LOW');
      expect(repo.sessionStates.get(sessionId)!.status).toBe('DATA_PARTIAL');
    }

    // The amount stays traceable through the snapshot the row points at.
    const row = repo.currentFor('session-morning')[0];
    const snapshot = repo.snapshots.find((item) => item.id === row.sourceSnapshotId)!;
    expect(snapshot.metrics.gmv!.toString()).toBe('77025508.9');
  });

  it('C7: số cộng dồn giảm thì không ghi dòng nào cho ca đó', async () => {
    const repo = new MemoryRepository();
    handoverSessions(repo);

    await upload(repo, 'hash-sai-thu-tu', [
      morningSnapshot,
      { ...afternoonSnapshot, gmv: '20,000,000.00₫', orders: '20' },
    ]);

    expect(repo.currentFor('session-afternoon')).toHaveLength(0);
    expect(repo.sessionStates.get('session-afternoon')).toEqual({
      sessionId: 'session-afternoon',
      status: 'DATA_PARTIAL',
      dataConfidence: 'NEEDS_REVIEW',
    });
    // The morning shift is unaffected: its own snapshot is still sound.
    expect(repo.currentFor('session-morning')[0].metrics.gmv!.toString()).toBe('30000000');
  });

  it('C8: cùng Room ID kéo dài quá ngưỡng liên tục thì phải rà soát', async () => {
    const repo = new MemoryRepository();

    await upload(repo, 'hash-gap', [
      {
        roomId: ROOM_LONG,
        start: '2026-09-09 10:00:00',
        end: '2026-09-10 20:00:00',
        duration: '34h00m',
        gmv: '5,000,000.00₫',
      },
    ]);

    const discovered = repo.sessions.filter((session) => session.ownership === 'UNKNOWN');
    expect(discovered).toHaveLength(1);
    const row = repo.currentFor(discovered[0].id)[0];
    expect(row.issues).toContain('CONTINUITY_GAP_EXCEEDED');
    expect(row.confidence).toBe('NEEDS_REVIEW');
  });
});

describe('nhóm D — ownership', () => {
  it('D1: đoạn live không khớp ca nào thành ca UNKNOWN chờ Operation', async () => {
    const repo = new MemoryRepository();

    await upload(repo, 'hash-inhouse', [
      {
        roomId: ROOM_A,
        start: '2026-09-11 09:00:00',
        end: '2026-09-11 11:00:00',
        duration: '2h00m',
        gmv: '4,200,000.00₫',
      },
    ]);

    expect(repo.sessions).toHaveLength(1);
    expect(repo.sessions[0].ownership).toBe('UNKNOWN');
    expect(repo.currentFor(repo.sessions[0].id)[0].metrics.gmv!.toString()).toBe('4200000');
  });

  it('D2: sau khi Operation xác nhận brand tự live, import lại không tạo ca UNKNOWN mới', async () => {
    const repo = new MemoryRepository();
    const rows: LiveRowInput[] = [
      {
        roomId: ROOM_A,
        start: '2026-09-11 09:00:00',
        end: '2026-09-11 11:00:00',
        duration: '2h00m',
        gmv: '4,200,000.00₫',
      },
    ];

    await upload(repo, 'hash-lan-1', rows);
    const discovered = repo.sessions[0];
    discovered.ownership = 'BRAND_INHOUSE';

    await upload(repo, 'hash-lan-2', [
      ...rows,
      {
        roomId: ROOM_B,
        start: '2026-09-11 14:00:00',
        end: '2026-09-11 16:00:00',
        duration: '2h00m',
        gmv: '9,000,000.00₫',
      },
    ]);

    expect(repo.sessions.filter((session) => session.ownership === 'BRAND_INHOUSE')).toHaveLength(1);
    expect(repo.currentFor(discovered.id)).toHaveLength(1);
    expect(repo.currentFor(discovered.id)[0].metrics.gmv!.toString()).toBe('4200000');
  });
});
