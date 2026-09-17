import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import type { CumulativeMetrics } from '../../parsing/live-performance';
import {
  aggregateTotals,
  aov,
  conversionRateOnClicks,
  gmvPerHour,
  targetAchievement,
  type MetricTotals,
} from '../formulas';

function totals(values: Partial<MetricTotals> = {}): MetricTotals {
  return {
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
    liveMinutes: null,
    ...values,
  };
}

function sessionResult(gmv: string | null, orders: number | null, liveMinutes: number | null) {
  const metrics = {
    gmv: gmv === null ? null : new Decimal(gmv),
    itemsSold: null,
    orders,
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
  } satisfies CumulativeMetrics;
  return { metrics, liveMinutes };
}

describe('E1 — chỉ số dẫn xuất phải tính lại, không trừ', () => {
  it('AOV ca sau là số dương, tính từ GMV và orders đã tách', () => {
    const afternoon = totals({ gmv: new Decimal('47025508.90'), orders: 52 });

    const value = aov(afternoon)!;

    expect(value.toNumber()).toBeGreaterThan(0);
    expect(value.toFixed(2)).toBe('904336.71');
  });

  it('cho thấy vì sao không được trừ AOV của hai snapshot', () => {
    const reportedAovBefore = new Decimal('1000000');
    const reportedAovAfter = new Decimal('900000');

    expect(reportedAovAfter.minus(reportedAovBefore).isNegative()).toBe(true);
  });
});

describe('E2 — mẫu số bằng 0 trả N/A, không phải 0', () => {
  it('CVR là null khi chưa có lượt click sản phẩm', () => {
    expect(conversionRateOnClicks(totals({ orders: 0, productClicks: 0 }))).toBeNull();
  });

  it('vẫn trả 0 khi thực sự đo được 0', () => {
    expect(conversionRateOnClicks(totals({ orders: 0, productClicks: 120 }))).toBe(0);
  });
});

describe('E3 — không lấy trung bình của trung bình', () => {
  it('AOV brand tính bằng tổng GMV chia tổng orders', () => {
    const rolled = aggregateTotals([sessionResult('10000000', 10, 120), sessionResult('90000000', 30, 180)]);

    const brandAov = aov(rolled)!;

    expect(brandAov.toFixed(0)).toBe('2500000');
    expect(brandAov.toFixed(0)).not.toBe('2000000');
  });
});

describe('E5 — chưa set target thì không có achievement', () => {
  it('trả null thay vì 0%', () => {
    expect(targetAchievement(new Decimal('30000000'), null)).toBeNull();
  });

  it('tính đúng khi có target', () => {
    expect(targetAchievement(new Decimal('28500000'), new Decimal('30000000'))).toBeCloseTo(95, 5);
  });
});

describe('E6 — GMV/giờ dùng giờ của ca, không dùng thời lượng cả room', () => {
  it('ca chiều 182,8 phút cho kết quả khác hẳn khi lấy nhầm 360 phút của room', () => {
    const gmv = new Decimal('47025508.90');

    const correct = gmvPerHour(totals({ gmv, liveMinutes: 182.8 }))!;
    const wrong = gmvPerHour(totals({ gmv, liveMinutes: 360 }))!;

    expect(correct.toFixed(0)).toBe('15435069');
    expect(wrong.toFixed(0)).toBe('7837585');
    expect(correct.dividedBy(wrong).toNumber()).toBeGreaterThan(1.9);
  });
});

describe('E7 — phòng live chỉ vài giây', () => {
  it('không chia cho khoảng thời gian gần bằng 0', () => {
    expect(gmvPerHour(totals({ gmv: new Decimal('0'), liveMinutes: 11 / 60 }))).toBeNull();
  });
});
