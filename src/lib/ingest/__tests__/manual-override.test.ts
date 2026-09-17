import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { parseLivePerformanceWorkbook } from '../../parsing/live-performance';
import { buildLiveWorkbook, type LiveRowInput } from '../../parsing/__tests__/fixtures';
import { importLivePerformance } from '../live-import';
import { MemoryRepository } from '../memory-repository';

const ACCOUNT = 'account-1';
const ROOM = '7683365340126808852';

function at(value: string): Date {
  return new Date(`${value}+07:00`);
}

const snapshot: LiveRowInput = {
  roomId: ROOM,
  start: '2026-09-09 10:01:57',
  end: '2026-09-09 13:00:00',
  duration: '2h58m',
  gmv: '30,000,000.00₫',
  orders: '30',
};

async function importFile(store: MemoryRepository, hash: string, rows: LiveRowInput[]) {
  const parsed = await parseLivePerformanceWorkbook(await buildLiveWorkbook(rows));
  return importLivePerformance(
    store,
    {
      platformAccountId: ACCOUNT,
      uploadedBy: 'assistant',
      fileName: `${hash}.xlsx`,
      fileHash: hash,
      storagePath: `imports/${hash}.xlsx`,
    },
    parsed,
  );
}

describe('kết quả Operation nhập tay', () => {
  it('không bị engine ghi đè khi tính lại', async () => {
    const store = new MemoryRepository();
    store.addSession({
      id: 'ca-sang',
      brandId: 'brand-1',
      platformAccountId: ACCOUNT,
      startAt: at('2026-09-09 10:00:00'),
      endAt: at('2026-09-09 13:00:00'),
    });

    await importFile(store, 'hash-1', [snapshot]);
    const room = store.rooms[0];

    // Operation replaces the computed figure by hand, with a reason.
    await store.supersedeAttributions(['ca-sang']);
    store.attributions.push({
      sessionId: 'ca-sang',
      roomId: room.id,
      method: 'MANUAL',
      sourceSnapshotId: null,
      prevSnapshotId: null,
      segmentStartAt: at('2026-09-09 10:01:57'),
      segmentEndAt: at('2026-09-09 13:00:00'),
      durationMinutes: 178,
      metrics: { ...store.snapshots[0].metrics, gmv: new Decimal('29000000') },
      confidence: 'MEDIUM',
      issues: [],
      computedReason: 'Operation chốt theo đối soát với brand',
      isCurrent: true,
    });

    // A later upload triggers a recompute of the same window.
    await importFile(store, 'hash-2', [
      { ...snapshot, end: '2026-09-09 12:59:00', gmv: '29,500,000.00₫' },
    ]);

    const current = store.currentFor('ca-sang');
    expect(current).toHaveLength(1);
    expect(current[0].method).toBe('MANUAL');
    expect(current[0].metrics.gmv!.toString()).toBe('29000000');
  });
});
