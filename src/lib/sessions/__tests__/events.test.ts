import { describe, expect, it } from 'vitest';
import { parseLivePerformanceWorkbook } from '../../parsing/live-performance';
import { buildLiveWorkbook, type LiveRowInput } from '../../parsing/__tests__/fixtures';
import { importLivePerformance } from '../../ingest/live-import';
import { MemoryRepository } from '../../ingest/memory-repository';
import { MemoryEventRepository } from '../memory-event-repository';
import { SessionEventError, requiresUploadAfter, timePatchesFor } from '../events';
import { logSessionEvent } from '../log-event';

const ACCOUNT = 'account-1';
const ASSISTANT = 'assistant-1';
const ROOM = '7683365340126808852';

function at(value: string): Date {
  return new Date(`${value}+07:00`);
}

async function importFile(store: MemoryRepository, hash: string, rows: LiveRowInput[]) {
  const parsed = await parseLivePerformanceWorkbook(await buildLiveWorkbook(rows));
  return importLivePerformance(
    store,
    {
      platformAccountId: ACCOUNT,
      uploadedBy: ASSISTANT,
      fileName: `${hash}.xlsx`,
      fileHash: hash,
      storagePath: `imports/${hash}.xlsx`,
    },
    parsed,
  );
}

function twoShifts(store: MemoryRepository) {
  store.addSession({
    id: 'ca-sang',
    brandId: 'brand-1',
    platformAccountId: ACCOUNT,
    startAt: at('2026-09-09 10:00:00'),
    endAt: at('2026-09-09 13:00:00'),
  });
  store.addSession({
    id: 'ca-chieu',
    brandId: 'brand-1',
    platformAccountId: ACCOUNT,
    startAt: at('2026-09-09 13:00:00'),
    endAt: at('2026-09-09 16:00:00'),
  });
}

describe('log sự kiện trong ca', () => {
  it('bàn giao ca dịch mốc kết thúc ca này và mốc bắt đầu ca kia về cùng một thời điểm', async () => {
    const patches = timePatchesFor({
      sessionId: 'ca-sang',
      eventType: 'HANDOVER_AGENCY_TEAM',
      occurredAt: at('2026-09-09 14:04:00'),
      relatedSessionId: 'ca-chieu',
    });

    expect(patches).toEqual([
      { sessionId: 'ca-sang', actualEndAt: at('2026-09-09 14:04:00') },
      { sessionId: 'ca-chieu', actualStartAt: at('2026-09-09 14:04:00') },
    ]);
  });

  it('restart và đổi người không dịch ranh giới ca', async () => {
    for (const eventType of ['RESTART_TECHNICAL', 'HOST_CHANGED', 'OVERTIME_EXTENDED'] as const) {
      expect(
        timePatchesFor({
          sessionId: 'ca-sang',
          eventType,
          occurredAt: at('2026-09-09 12:00:00'),
          roomId: 'room-1',
          toUserId: 'user-2',
          reason: 'mất mạng',
        }),
      ).toEqual([]);
    }
  });

  it('off sớm bắt buộc có lý do', async () => {
    const store = new MemoryRepository();
    twoShifts(store);
    const repo = new MemoryEventRepository(store);

    await expect(
      logSessionEvent(
        repo,
        { sessionId: 'ca-sang', eventType: 'ENDED_EARLY', occurredAt: at('2026-09-09 12:00:00') },
        ASSISTANT,
        at('2026-09-09 12:00:00'),
      ),
    ).rejects.toThrow(SessionEventError);
    expect(repo.events).toHaveLength(0);
  });

  it('không log được sự kiện ở thời điểm tương lai', async () => {
    const store = new MemoryRepository();
    twoShifts(store);
    const repo = new MemoryEventRepository(store);

    await expect(
      logSessionEvent(
        repo,
        { sessionId: 'ca-sang', eventType: 'SESSION_ENDED', occurredAt: at('2026-09-09 15:00:00') },
        ASSISTANT,
        at('2026-09-09 12:00:00'),
      ),
    ).rejects.toThrow(/tương lai/);
  });

  it('không bàn giao sang ca của tài khoản nền tảng khác', async () => {
    const store = new MemoryRepository();
    twoShifts(store);
    store.addSession({
      id: 'ca-brand-khac',
      brandId: 'brand-2',
      platformAccountId: 'account-2',
      startAt: at('2026-09-09 13:00:00'),
      endAt: at('2026-09-09 16:00:00'),
    });
    const repo = new MemoryEventRepository(store);

    await expect(
      logSessionEvent(
        repo,
        {
          sessionId: 'ca-sang',
          eventType: 'HANDOVER_AGENCY_TEAM',
          occurredAt: at('2026-09-09 14:00:00'),
          relatedSessionId: 'ca-brand-khac',
        },
        ASSISTANT,
        at('2026-09-09 14:00:00'),
      ),
    ).rejects.toThrow(/tài khoản nền tảng khác/);
  });

  it('các sự kiện kết thúc/bàn giao đều dẫn tới bước nộp dữ liệu', async () => {
    expect(requiresUploadAfter('HANDOVER_AGENCY_TEAM')).toBe(true);
    expect(requiresUploadAfter('ENDED_EARLY')).toBe(true);
    expect(requiresUploadAfter('RESTART_TECHNICAL')).toBe(false);
  });
});

describe('event log là input của attribution engine', () => {
  it('bàn giao muộn hơn lịch: ca sáng nhận đúng phần của mình thay vì bị gộp chung', async () => {
    const store = new MemoryRepository();
    twoShifts(store);
    const repo = new MemoryEventRepository(store);

    // The handover really happened at 14:04, an hour after the schedule said.
    // The assistant uploaded the report at that moment.
    const rows: LiveRowInput[] = [
      {
        roomId: ROOM,
        start: '2026-09-09 10:01:57',
        end: '2026-09-09 14:04:00',
        duration: '4h02m',
        gmv: '40,000,000.00₫',
        orders: '40',
      },
    ];

    // Without the event, that stretch overlaps both scheduled shifts, so
    // neither may claim it.
    await importFile(store, 'hash-1', rows);
    expect(store.currentFor('ca-sang')[0].method).toBe('SHARED_UNALLOCATED');
    expect(store.currentFor('ca-sang')[0].metrics.gmv).toBeNull();

    await logSessionEvent(
      repo,
      {
        sessionId: 'ca-sang',
        eventType: 'HANDOVER_AGENCY_TEAM',
        occurredAt: at('2026-09-09 14:04:00'),
        relatedSessionId: 'ca-chieu',
      },
      ASSISTANT,
      at('2026-09-09 14:04:00'),
    );

    // With the real boundary logged, the morning shift owns its stretch outright.
    const morning = store.currentFor('ca-sang')[0];
    expect(morning.method).toBe('FULL_SNAPSHOT');
    expect(morning.metrics.gmv!.toString()).toBe('40000000');
    expect(morning.confidence).toBe('HIGH');
    expect(store.currentFor('ca-chieu')).toHaveLength(0);
  });

  it('off sớm rút ngắn ca, phần còn lại của room không bị tính cho ca đó', async () => {
    const store = new MemoryRepository();
    twoShifts(store);
    const repo = new MemoryEventRepository(store);

    await logSessionEvent(
      repo,
      {
        sessionId: 'ca-chieu',
        eventType: 'ENDED_EARLY',
        occurredAt: at('2026-09-09 14:00:00'),
        reason: 'Hiệu suất thấp, brand đồng ý off sớm',
      },
      ASSISTANT,
      at('2026-09-09 14:00:00'),
    );

    const session = store.sessions.find((item) => item.id === 'ca-chieu')!;
    expect(session.endAt).toEqual(at('2026-09-09 14:00:00'));
    expect(repo.events[0].reason).toContain('Hiệu suất thấp');
  });
});
