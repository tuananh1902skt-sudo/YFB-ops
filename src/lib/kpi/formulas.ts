import { Decimal } from 'decimal.js';
import { COUNT_FIELDS, type CumulativeMetrics } from '../parsing/live-performance';
import type { SessionResult } from '../attribution/types';

/**
 * Every metric in the system is computed here, so a figure means the same thing
 * on every screen. `null` is the system's "N/A": it means not measurable, and it
 * is never collapsed into zero, which would drag averages down.
 */

/** Below a minute of airtime, per-hour rates say more about rounding than performance. */
export const MIN_MINUTES_FOR_RATE = 1;

export interface MetricTotals extends CumulativeMetrics {
  liveMinutes: number | null;
}

function percent(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return (numerator / denominator) * 100;
}

export function aov(totals: MetricTotals): Decimal | null {
  if (totals.gmv === null || totals.orders === null || totals.orders === 0) return null;
  return totals.gmv.dividedBy(totals.orders);
}

export function gmvPerHour(totals: MetricTotals): Decimal | null {
  if (totals.gmv === null || totals.liveMinutes === null) return null;
  if (totals.liveMinutes < MIN_MINUTES_FOR_RATE) return null;
  return totals.gmv.dividedBy(new Decimal(totals.liveMinutes).dividedBy(60));
}

export function ordersPerHour(totals: MetricTotals): number | null {
  if (totals.orders === null || totals.liveMinutes === null) return null;
  if (totals.liveMinutes < MIN_MINUTES_FOR_RATE) return null;
  return totals.orders / (totals.liveMinutes / 60);
}

export function itemsPerOrder(totals: MetricTotals): number | null {
  if (totals.itemsSold === null || totals.orders === null || totals.orders === 0) return null;
  return totals.itemsSold / totals.orders;
}

export function productCtr(totals: MetricTotals): number | null {
  return percent(totals.productClicks, totals.productImpressions);
}

/** The system's default CVR. Any other denominator must be labelled on screen. */
export function conversionRateOnClicks(totals: MetricTotals): number | null {
  return percent(totals.orders, totals.productClicks);
}

export function conversionRateOnViews(totals: MetricTotals): number | null {
  return percent(totals.orders, totals.views);
}

export function gmvPerView(totals: MetricTotals): Decimal | null {
  if (totals.gmv === null || totals.views === null || totals.views === 0) return null;
  return totals.gmv.dividedBy(totals.views);
}

/** Without a target there is no achievement — reporting 0% would be a false failure. */
export function targetAchievement(gmv: Decimal | null, targetGmv: Decimal | null): number | null {
  if (gmv === null || targetGmv === null || targetGmv.isZero()) return null;
  return gmv.dividedBy(targetGmv).times(100).toNumber();
}

export function targetGap(gmv: Decimal | null, targetGmv: Decimal | null): Decimal | null {
  if (gmv === null || targetGmv === null) return null;
  return gmv.minus(targetGmv);
}

/** Estimated only: real refunds settle about 15 days later. */
export function estimatedNmv(gmv: Decimal | null, estimatedRefundRate: number): Decimal | null {
  if (gmv === null) return null;
  return gmv.times(new Decimal(1).minus(estimatedRefundRate));
}

/**
 * Rolls sessions up by summing the raw numerators and denominators. Averaging
 * each session's own ratios would weight a one-hour shift like a six-hour one.
 */
export function aggregateTotals(results: Pick<SessionResult, 'metrics' | 'liveMinutes'>[]): MetricTotals {
  const totals: MetricTotals = {
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
  };

  const gmvValues = results.map((result) => result.metrics.gmv).filter((value) => value !== null);
  if (gmvValues.length > 0) {
    totals.gmv = gmvValues.reduce<Decimal>((sum, value) => sum.plus(value), new Decimal(0));
  }

  for (const field of COUNT_FIELDS) {
    const values = results.map((result) => result.metrics[field]).filter((value) => value !== null);
    if (values.length === 0) continue;
    totals[field] = values.reduce<number>((sum, value) => sum + value, 0);
  }

  const minutes = results.map((result) => result.liveMinutes).filter((value): value is number => value !== null);
  totals.liveMinutes = minutes.length === 0 ? null : minutes.reduce((sum, value) => sum + value, 0);

  return totals;
}
