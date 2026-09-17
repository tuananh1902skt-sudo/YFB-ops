import { describe, expect, it } from 'vitest';
import { parseLivePerformanceWorkbook } from '../../parsing/live-performance';
import { buildLiveWorkbook, type LiveRowInput } from '../../parsing/__tests__/fixtures';
import { importLivePerformance } from '../../ingest/live-import';
import { MemoryRepository } from '../../ingest/memory-repository';
import { MemoryOwnershipRepository } from '../memory-ownership-repository';
import {
  OwnershipDecisionError,
  confirmAgencyShift,
  confirmBrandInhouse,
  mergeIntoSession,
} from '../ownership';

const ACCOUNT = 'account-1';
const OPERATOR = 'operation-user';
const ROOM = '7683365340126808853';

function at(value: string): Date {
  return new Date(`${value}+07:00`);
}

const inhouseStretch: LiveRowInput = {
  roomId: ROOM,
  start: '2026-09-11 09:00:00',
  end: '2026-09-11 11:00:00',
  duration: '2h00m',
  gmv: '4,200,000.00₫',
  orders: '7',
};

async function importFile(repo: MemoryRepository, hash: string, rows: LiveRowInput[]) {
  const parsed = await parseLivePerformanceWorkbook(await buildLiveWorkbook(rows));
  return importLivePerformance(
    repo,
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

async function withDiscoveredStretch() {
  const store = new MemoryRepository();
  await importFile(store, 'hash-1', [inhouseStretch]);
  const discovered = store.sessions.find((session) => session.ownership === 'UNKNOWN')!;
  return { store, ownership: new MemoryOwnershipRepository(store), discovered };
}

describe('D2 — Operation xác nhận ownership', () => {
  it('xác nhận brand tự live: giữ số liệu, ghi người xác nhận và audit log', async () => {
    const { store, ownership, discovered } = await withDiscoveredStretch();

    await confirmBrandInhouse(ownership, discovered.id, 'Brand báo tự live sáng 11/09', OPERATOR);

    expect(discovered.ownership).toBe('BRAND_INHOUSE');
    expect(ownership.confirmedBy.get(discovered.id)?.userId).toBe(OPERATOR);
    // The figures stay: they are needed to say how much of the day was ours.
    expect(store.currentFor(discovered.id)[0].metrics.gmv!.toString()).toBe('4200000');
    expect(store.auditLogs[0]).toMatchObject({
      entityType: 'live_sessions',
      action: 'OWNERSHIP_CONFIRMED',
      beforeData: { ownership: 'UNKNOWN' },
      afterData: { ownership: 'BRAND_INHOUSE' },
      reason: 'Brand báo tự live sáng 11/09',
      actorId: OPERATOR,
    });
  });

  it('không cho xác nhận nếu bỏ trống lý do', async () => {
    const { ownership, discovered } = await withDiscoveredStretch();

    await expect(confirmBrandInhouse(ownership, discovered.id, '   ', OPERATOR)).rejects.toThrow(
      OwnershipDecisionError,
    );
    expect(discovered.ownership).toBe('UNKNOWN');
  });

  it('không xác nhận đè lên ca đã được xác nhận trước đó', async () => {
    const { ownership, discovered } = await withDiscoveredStretch();
    await confirmAgencyShift(ownership, discovered.id, 'Thiếu booking, ca của agency', OPERATOR);

    await expect(
      confirmBrandInhouse(ownership, discovered.id, 'Đổi ý', OPERATOR),
    ).rejects.toThrow(/đã được xác nhận/);
  });
});

describe('gộp đoạn chưa xác định vào ca đã book', () => {
  it('số liệu chuyển sang ca đích bằng cách tính lại, không bê tay', async () => {
    const { store, ownership, discovered } = await withDiscoveredStretch();
    // The shift was booked, but its hours were entered wrong, so the stretch
    // never matched it.
    const booked = store.addSession({
      id: 'session-booked',
      brandId: 'brand-1',
      platformAccountId: ACCOUNT,
      startAt: at('2026-09-11 13:00:00'),
      endAt: at('2026-09-11 15:00:00'),
    });

    await mergeIntoSession(
      ownership,
      discovered.id,
      booked.id,
      'Ca nhập nhầm giờ, thực tế live 09:00–11:00',
      OPERATOR,
    );

    expect(store.currentFor(discovered.id)).toHaveLength(0);
    expect(discovered.status).toBe('CANCELLED');

    const rows = store.currentFor(booked.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].metrics.gmv!.toString()).toBe('4200000');
    expect(rows[0].metrics.orders).toBe(7);

    // No new placeholder appears in place of the one that was merged away.
    expect(store.sessions.filter((session) => session.ownership === 'UNKNOWN' && session.status !== 'CANCELLED')).toHaveLength(0);
  });

  it('ghi audit log cả hai phía, kèm khung giờ trước và sau', async () => {
    const { store, ownership, discovered } = await withDiscoveredStretch();
    const booked = store.addSession({
      id: 'session-booked',
      brandId: 'brand-1',
      platformAccountId: ACCOUNT,
      startAt: at('2026-09-11 13:00:00'),
      endAt: at('2026-09-11 15:00:00'),
    });

    await mergeIntoSession(ownership, discovered.id, booked.id, 'Nhập nhầm giờ', OPERATOR);

    const merged = store.auditLogs.find((entry) => entry.action === 'MERGED_INTO_SESSION')!;
    const extended = store.auditLogs.find((entry) => entry.action === 'WINDOW_EXTENDED_BY_MERGE')!;
    expect(merged.afterData).toMatchObject({ status: 'CANCELLED', mergedInto: booked.id });
    expect(extended.beforeData).toMatchObject({ startAt: at('2026-09-11 13:00:00').toISOString() });
    expect(extended.afterData).toMatchObject({ startAt: at('2026-09-11 09:00:00').toISOString() });
  });

  it('không gộp hai ca thuộc hai tài khoản nền tảng khác nhau', async () => {
    const { store, ownership, discovered } = await withDiscoveredStretch();
    const otherAccount = store.addSession({
      id: 'session-other-account',
      brandId: 'brand-2',
      platformAccountId: 'account-2',
      startAt: at('2026-09-11 09:00:00'),
      endAt: at('2026-09-11 11:00:00'),
    });

    await expect(
      mergeIntoSession(ownership, discovered.id, otherAccount.id, 'Gộp nhầm', OPERATOR),
    ).rejects.toThrow(/tài khoản nền tảng khác nhau/);
    expect(discovered.status).not.toBe('CANCELLED');
  });
});
