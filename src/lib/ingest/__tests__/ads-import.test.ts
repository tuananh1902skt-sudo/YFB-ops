import { describe, expect, it } from 'vitest';
import { parseAdsDailyWorkbook } from '../../parsing/ads-daily';
import { buildAdsWorkbook, type AdsRowInput } from '../../parsing/__tests__/fixtures';
import { importAdsDaily } from '../ads-import';
import { MemoryRepository } from '../memory-repository';
import type { ImportContext } from '../types';

const ACCOUNT = 'account-1';

function context(fileHash: string): ImportContext {
  return {
    platformAccountId: ACCOUNT,
    uploadedBy: 'user-1',
    fileName: `ads_${fileHash}.xlsx`,
    fileHash,
    storagePath: `imports/${fileHash}.xlsx`,
  };
}

async function upload(repo: MemoryRepository, fileHash: string, rows: AdsRowInput[]) {
  const parsed = await parseAdsDailyWorkbook(await buildAdsWorkbook(rows));
  return importAdsDaily(repo, context(fileHash), parsed);
}

const september9: AdsRowInput = {
  date: '2026-09-09',
  spend: '2652354',
  skuOrders: '75',
  costPerOrder: '35364',
  grossRevenue: '132952442',
  roi: '50.13',
};

describe('nhóm B — import ads', () => {
  it('B4: import lại cùng ngày thì ghi đè và lưu vết giá trị cũ', async () => {
    const repo = new MemoryRepository();

    await upload(repo, 'hash-ads-1', [september9]);
    const second = await upload(repo, 'hash-ads-2', [{ ...september9, spend: '2900000' }]);

    expect(second.status).toBe('IMPORTED');
    if (second.status !== 'IMPORTED') return;

    // One row per day, never a second row for the same date.
    expect(repo.ads).toHaveLength(1);
    expect(repo.ads[0].adsSpend.toString()).toBe('2900000');
    expect(second.daysOverwritten).toEqual([
      { statDate: '2026-09-09', previousSpend: '2652354', newSpend: '2900000' },
    ]);

    expect(repo.auditLogs).toHaveLength(1);
    expect(repo.auditLogs[0]).toMatchObject({
      entityType: 'ads_daily',
      entityId: `${ACCOUNT}:2026-09-09`,
      action: 'OVERWRITE',
      beforeData: { adsSpend: '2652354' },
      afterData: { adsSpend: '2900000' },
      actorId: 'user-1',
    });
  });

  it('số không đổi thì không ghi audit log thừa', async () => {
    const repo = new MemoryRepository();

    await upload(repo, 'hash-ads-1', [september9]);
    await upload(repo, 'hash-ads-2', [september9]);

    expect(repo.ads).toHaveLength(1);
    expect(repo.auditLogs).toHaveLength(0);
  });

  it('upload lại đúng file đó bị nhận diện trùng', async () => {
    const repo = new MemoryRepository();

    await upload(repo, 'hash-ads-1', [september9]);
    const again = await upload(repo, 'hash-ads-1', [september9]);

    expect(again.status).toBe('DUPLICATE_FILE');
    expect(repo.imports).toHaveLength(1);
  });

  it('không có API nào gắn số ads vào ca live', async () => {
    const repo = new MemoryRepository();
    await upload(repo, 'hash-ads-1', [september9]);

    // Ads figures are daily and shop-wide; the store keeps them apart from
    // everything a shift is measured by (docs/01 §10).
    expect(repo.attributions).toHaveLength(0);
    expect(Object.keys(repo.ads[0])).not.toContain('sessionId');
  });
});
