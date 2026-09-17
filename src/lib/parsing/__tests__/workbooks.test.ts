import { describe, expect, it } from 'vitest';
import { parseAdsDailyWorkbook } from '../ads-daily';
import { parseLivePerformanceWorkbook } from '../live-performance';
import { buildAdsWorkbook, buildLiveWorkbook } from './fixtures';

describe('A6 — bỏ qua dòng tiêu đề và dòng trống của file live', () => {
  it('đọc đúng số dòng dữ liệu và khoảng thời gian export', async () => {
    const buffer = await buildLiveWorkbook([
      {
        roomId: '7683505862182275861',
        start: '2026-09-09 19:07:06',
        end: '2026-09-09 22:07:37',
        duration: '3h00m',
        gmv: '30,329,959.79₫',
      },
      {
        roomId: '7683365340126808852',
        start: '2026-09-09 10:01:57',
        end: '2026-09-09 16:02:48',
        duration: '6h00m',
        gmv: '77,025,508.90₫',
      },
    ]);

    const result = await parseLivePerformanceWorkbook(buffer);
    if (result.status !== 'PARSED') throw new Error('kỳ vọng parse thành công');

    expect(result.rows).toHaveLength(2);
    expect(result.failedRows).toHaveLength(0);
    expect(result.dataPeriod).toEqual({ start: '2026-07-01', end: '2026-09-17' });
    expect(result.rows[0].platformRoomId).toBe('7683505862182275861');
    expect(result.rows[0].metrics.gmv?.toString()).toBe('30329959.79');
  });

  it('giữ nguyên giá trị gốc của mọi ô để truy vết ngược', async () => {
    const buffer = await buildLiveWorkbook([
      {
        roomId: '7658664691129158420',
        start: '2026-07-04 20:30:37',
        end: '2026-07-04 20:30:48',
        duration: '0h00m',
        gmv: '0.00₫',
        liveCtr: '',
      },
    ]);

    const result = await parseLivePerformanceWorkbook(buffer);
    if (result.status !== 'PARSED') throw new Error('kỳ vọng parse thành công');

    expect(result.rows[0].rawValues['Attributed GMV']).toBe('0.00₫');
    expect(result.rows[0].reportedDerived.liveCtr).toBeNull();
  });
});

describe('A8 — header lạ thì không tự đoán', () => {
  it('dừng lại chờ mapping thủ công, không import dòng nào', async () => {
    const buffer = await buildLiveWorkbook(
      [
        {
          roomId: '7683505862182275861',
          start: '2026-09-09 19:07:06',
          end: '2026-09-09 22:07:37',
          duration: '3h00m',
          gmv: '30,329,959.79₫',
        },
      ],
      { headerOverrides: { 'Attributed GMV': 'Gross Revenue' } },
    );

    const result = await parseLivePerformanceWorkbook(buffer);

    expect(result.status).toBe('NEEDS_MAPPING');
    if (result.status !== 'NEEDS_MAPPING') return;
    expect(result.missingColumns).toContain('Attributed GMV');
    expect(result.unexpectedColumns).toContain('Gross Revenue');
  });
});

describe('C11 — room có thật nhưng GMV bằng 0', () => {
  it('ghi nhận 0 đo được, không phải thiếu dữ liệu', async () => {
    const buffer = await buildLiveWorkbook([
      {
        roomId: '7677196130832108309',
        start: '2026-08-23 19:02:05',
        end: '2026-08-23 19:04:13',
        duration: '0h02m',
        gmv: '0.00₫',
      },
    ]);

    const result = await parseLivePerformanceWorkbook(buffer);
    if (result.status !== 'PARSED') throw new Error('kỳ vọng parse thành công');

    expect(result.rows[0].metrics.gmv?.toNumber()).toBe(0);
    expect(result.rows[0].metrics.gmv).not.toBeNull();
  });
});

describe('A7 — loại dòng tổng của file ads', () => {
  it('không import dòng tổng, tổng cộng trong DB khớp dòng tổng của file', async () => {
    const rows = [
      { date: '2026-09-15', spend: '560207', skuOrders: '6', costPerOrder: '93368', grossRevenue: '5099998', roi: '9.10' },
      { date: '2026-09-16', spend: '100225', skuOrders: '2', costPerOrder: '50113', grossRevenue: '4100000', roi: '40.91' },
      { date: '2026-09-17', spend: '2819', skuOrders: '0', costPerOrder: '0', grossRevenue: '0', roi: '0.00' },
    ];
    const buffer = await buildAdsWorkbook(rows, { includeTotalsRow: true });

    const result = await parseAdsDailyWorkbook(buffer);
    if (result.status !== 'PARSED') throw new Error('kỳ vọng parse thành công');

    expect(result.rows).toHaveLength(3);
    expect(result.totalsRowSkipped).toBe(true);

    const importedTotal = result.rows.reduce((sum, row) => sum.plus(row.adsSpend), result.rows[0].adsSpend.minus(result.rows[0].adsSpend));
    expect(importedTotal.toString()).toBe('663251');
  });

  it('F1 — ngày có chi phí ads nhưng không có ca live vẫn được lưu', async () => {
    const buffer = await buildAdsWorkbook([
      { date: '2026-09-17', spend: '2819', skuOrders: '0', costPerOrder: '0', grossRevenue: '0', roi: '0.00' },
    ]);

    const result = await parseAdsDailyWorkbook(buffer);
    if (result.status !== 'PARSED') throw new Error('kỳ vọng parse thành công');

    expect(result.rows[0].statDate).toBe('2026-09-17');
    expect(result.rows[0].adsSpend.toString()).toBe('2819');
  });
});
