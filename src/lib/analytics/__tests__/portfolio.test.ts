import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import type { DashboardSessionRow } from '../brand-dashboard';
import { buildPortfolio, type BrandPeriodInput } from '../portfolio';
import { DEFAULT_THRESHOLDS } from '../settings';

function row(overrides: Partial<DashboardSessionRow> = {}): DashboardSessionRow {
  return {
    sessionId: 's1',
    sessionDate: '2026-09-09',
    ownership: 'AGENCY',
    confidence: 'HIGH',
    status: 'DATA_COMPLETE',
    gmv: '30000000',
    orders: 30,
    itemsSold: 30,
    customers: 28,
    views: 10000,
    productImpressions: 9000,
    productClicks: 1200,
    liveMinutes: 180,
    targetGmv: '25000000',
    hasUnallocated: false,
    hostNames: ['Khói'],
    ...overrides,
  };
}

function brand(name: string, rows: DashboardSessionRow[], unallocated = 0): BrandPeriodInput {
  return {
    brandId: name.toLowerCase(),
    brandName: name,
    rows,
    unallocatedGmv: new Decimal(unallocated),
  };
}

function tile(portfolio: ReturnType<typeof buildPortfolio>, label: string) {
  return portfolio.tiles.find((item) => item.label === label)!;
}

describe('tổng hợp nhiều brand', () => {
  it('cộng số gốc của mọi brand rồi mới chia, không lấy trung bình các tỷ lệ', () => {
    // Brand A: 60tr / 2 giờ = 30tr/giờ. Brand B: 20tr / 6 giờ ≈ 3,3tr/giờ.
    // Trung bình hai tỷ lệ ra ~16,7tr/giờ; cộng gốc rồi chia ra 10tr/giờ.
    const portfolio = buildPortfolio(
      [
        brand('A', [row({ gmv: '60000000', liveMinutes: 120, targetGmv: null })]),
        brand('B', [row({ gmv: '20000000', liveMinutes: 360, targetGmv: null })]),
      ],
      'Tháng 9',
    );

    expect(tile(portfolio, 'GMV / giờ').value).toBe('10.000.000 ₫');
  });

  it('xếp brand theo GMV giảm dần', () => {
    const portfolio = buildPortfolio(
      [
        brand('Nhỏ', [row({ gmv: '10000000' })]),
        brand('Lớn', [row({ gmv: '90000000' })]),
      ],
      'Tháng 9',
    );

    expect(portfolio.brands.map((item) => item.brandName)).toEqual(['Lớn', 'Nhỏ']);
  });

  it('loại ca brand tự live và ca chưa rõ ownership khỏi mọi con số agency', () => {
    const portfolio = buildPortfolio(
      [
        brand('A', [
          row({ gmv: '30000000' }),
          row({ sessionId: 's2', ownership: 'BRAND_INHOUSE', gmv: '50000000' }),
          row({ sessionId: 's3', ownership: 'UNKNOWN', gmv: '20000000' }),
        ]),
      ],
      'Tháng 9',
    );

    expect(portfolio.gmvDisplay).toBe('30.000.000 ₫');
    expect(portfolio.brands[0].sessions).toBe(1);
    expect(portfolio.brands[0].inhouseGmvDisplay).toBe('50.000.000 ₫');
  });

  it('ca chưa quy kết không bị tính thành 0, và được đếm ra riêng', () => {
    const portfolio = buildPortfolio(
      [brand('A', [row(), row({ sessionId: 's2', gmv: null, hasUnallocated: true })], 26_300_000)],
      'Tháng 9',
    );

    expect(portfolio.gmvDisplay).toBe('30.000.000 ₫');
    expect(portfolio.excludedSessions).toBe(1);
    expect(portfolio.unallocatedDisplay).toBe('26.300.000 ₫');
  });

  it('tiền chưa quy kết của từng brand hiện ngay trong bảng, không giấu xuống chú thích', () => {
    const portfolio = buildPortfolio(
      [brand('A', [row()], 12_000_000), brand('B', [row({ gmv: '40000000' })])],
      'Tháng 9',
    );

    const a = portfolio.brands.find((item) => item.brandName === 'A')!;
    const b = portfolio.brands.find((item) => item.brandName === 'B')!;
    expect(a.unallocatedDisplay).toBe('12.000.000 ₫');
    expect(b.unallocatedDisplay).toBeNull();
  });

  it('brand chưa đặt target không bị báo 0% và không bị nêu là dưới ngưỡng', () => {
    const portfolio = buildPortfolio([brand('A', [row({ targetGmv: null })])], 'Tháng 9');

    expect(portfolio.brands[0].achievementDisplay).toBe('—');
    expect(portfolio.attention.some((item) => item.headline.includes('target'))).toBe(false);
  });

  it('nêu brand dưới ngưỡng target, theo ngưỡng cấu hình chứ không phải số cứng', () => {
    const rows = [row({ gmv: '20000000', targetGmv: '25000000' })]; // đạt 80%

    const mặcĐịnh = buildPortfolio([brand('A', rows)], 'Tháng 9');
    const nớiNgưỡng = buildPortfolio([brand('A', rows)], 'Tháng 9', {
      ...DEFAULT_THRESHOLDS,
      targetWarningPercent: 70,
    });

    expect(mặcĐịnh.attention.some((item) => item.headline.includes('80,0%'))).toBe(true);
    expect(nớiNgưỡng.attention.some((item) => item.headline.includes('80,0%'))).toBe(false);
  });

  it('việc nghiêm trọng đứng trước việc cần chú ý', () => {
    const portfolio = buildPortfolio(
      [
        brand('A', [
          row({ gmv: '20000000', targetGmv: '25000000' }),
          row({ sessionId: 's2', ownership: 'UNKNOWN' }),
        ]),
      ],
      'Tháng 9',
    );

    expect(portfolio.attention[0].severity).toBe('critical');
    expect(portfolio.attention[0].headline).toContain('chưa rõ ai vận hành');
  });

  it('mỗi việc cần xem đều chỉ tới màn hình xử lý được nó', () => {
    const portfolio = buildPortfolio(
      [brand('A', [row({ ownership: 'UNKNOWN' })], 5_000_000)],
      'Tháng 9',
    );

    expect(portfolio.attention.map((item) => item.href)).toEqual([
      '/operations/ownership',
      '/operations',
    ]);
  });

  it('một brand thì tự nhận đây là màn hình sai', () => {
    expect(buildPortfolio([brand('A', [row()])], 'Tháng 9').singleBrand).toBe(true);
    expect(buildPortfolio([brand('A', [row()]), brand('B', [row()])], 'Tháng 9').singleBrand).toBe(
      false,
    );
  });

  it('không có brand nào thì trả số chưa đo được, không trả 0', () => {
    const portfolio = buildPortfolio([], 'Tháng 9');

    expect(portfolio.gmvDisplay).toBe('—');
    expect(portfolio.brands).toEqual([]);
    expect(portfolio.attention).toEqual([]);
  });
});
