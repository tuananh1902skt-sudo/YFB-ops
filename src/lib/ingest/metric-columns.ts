import { Decimal } from 'decimal.js';
import { COUNT_FIELDS, type CountField, type CumulativeMetrics } from '../parsing/live-performance';

/** Cumulative fields as they are named in the database (docs/04 §room_snapshots). */
export const METRIC_COLUMNS: Record<CountField, string> = {
  itemsSold: 'items_sold',
  orders: 'orders',
  skuOrders: 'sku_orders',
  customers: 'customers',
  views: 'views',
  impressions: 'impressions',
  productImpressions: 'product_impressions',
  productClicks: 'product_clicks',
  newFollowers: 'new_followers',
  comments: 'comments',
  shares: 'shares',
  likes: 'likes',
};

/** `gmv` is read as text so a 9-digit amount never passes through a float. */
export const METRIC_SELECT = ['gmv::text', ...Object.values(METRIC_COLUMNS)].join(',');

export function metricsToColumns(metrics: CumulativeMetrics): Record<string, string | number | null> {
  const columns: Record<string, string | number | null> = {
    gmv: metrics.gmv === null ? null : metrics.gmv.toFixed(2),
  };
  for (const field of COUNT_FIELDS) {
    columns[METRIC_COLUMNS[field]] = metrics[field];
  }
  return columns;
}

export function metricsFromRow(row: Record<string, unknown>): CumulativeMetrics {
  const metrics = {
    gmv: row.gmv === null || row.gmv === undefined ? null : new Decimal(String(row.gmv)),
  } as CumulativeMetrics;

  for (const field of COUNT_FIELDS) {
    const value = row[METRIC_COLUMNS[field]];
    metrics[field] = value === null || value === undefined ? null : Number(value);
  }
  return metrics;
}
