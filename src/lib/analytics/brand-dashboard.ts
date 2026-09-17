import { Decimal } from 'decimal.js';
import type { DataConfidence, SessionOwnership } from '../attribution/types';
import { NOT_AVAILABLE, formatDuration, formatMoney, formatPercent } from '../format';
import {
  aov,
  conversionRateOnClicks,
  gmvPerHour,
  productCtr,
  targetAchievement,
  targetGap,
  type MetricTotals,
} from '../kpi/formulas';

export interface DashboardSessionRow {
  sessionId: string;
  sessionDate: string;
  ownership: SessionOwnership;
  confidence: DataConfidence | null;
  status: string;
  gmv: string | null;
  orders: number | null;
  itemsSold: number | null;
  customers: number | null;
  views: number | null;
  productImpressions: number | null;
  productClicks: number | null;
  liveMinutes: number | null;
  targetGmv: string | null;
  hasUnallocated: boolean;
  hostNames: string[];
}

export interface KpiTile {
  label: string;
  value: string;
  caveat: string | null;
}

export interface DailyPoint {
  date: string;
  label: string;
  /** Plain numbers: these drive pixel geometry, not money arithmetic. */
  agencyGmv: number;
  inhouseGmv: number;
  targetGmv: number | null;
  hasUnallocated: boolean;
}

export interface HostRow {
  name: string;
  sessions: number;
  gmvDisplay: string;
  gmvPerHourDisplay: string;
  aovDisplay: string;
  liveHoursDisplay: string;
  /** Shifts they worked whose GMV nobody can claim, so it is theirs neither. */
  unallocatedSessions: number;
}

export interface QualityRow {
  label: string;
  value: string;
  status: 'good' | 'warning' | 'critical';
  note: string | null;
}

export interface BrandDashboard {
  gmvDisplay: string;
  periodLabel: string;
  /** Shifts whose figures are not in the totals above, and why it matters. */
  excludedSessions: number;
  tiles: KpiTile[];
  daily: DailyPoint[];
  inhouseGmvDisplay: string;
  inhouseShareLabel: string | null;
  hosts: HostRow[];
  quality: QualityRow[];
}

function emptyTotals(): MetricTotals {
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
  };
}

export interface RowTotals {
  totals: MetricTotals;
  /** Shifts left out because their figures could not be split (docs/05 §10). */
  excluded: number;
}

/**
 * Adds the raw numerators and denominators, then divides once.
 *
 * Averaging each shift's own ratios would weight a one-hour shift like a
 * six-hour one (CLAUDE.md §8).
 *
 * A shift whose figures are unallocated is left out of the totals entirely
 * rather than counted as zero, and the count of what was left out is returned
 * with them — a period is not unknowable because one day of it is, but a total
 * that quietly omits shifts would be a lie of a different kind. The money
 * itself is reported beside the total, never folded into it.
 */
function sumRows(rows: DashboardSessionRow[]): RowTotals {
  const totals = emptyTotals();
  const contributing = rows.filter((row) => !row.hasUnallocated && row.gmv !== null);
  if (contributing.length === 0) return { totals, excluded: rows.length };

  const add = (
    field: 'orders' | 'itemsSold' | 'customers' | 'views' | 'productImpressions' | 'productClicks',
  ) => {
    const values = contributing.map((row) => row[field]);
    // Within the contributing set a missing field still makes its metric N/A:
    // a ratio built from a partial numerator would be wrong, not approximate.
    totals[field] = values.some((value) => value === null)
      ? null
      : values.reduce<number>((sum, value) => sum + value!, 0);
  };

  totals.gmv = contributing.reduce<Decimal>(
    (sum, row) => sum.plus(new Decimal(row.gmv!)),
    new Decimal(0),
  );

  add('orders');
  add('itemsSold');
  add('customers');
  add('views');
  add('productImpressions');
  add('productClicks');

  const minutes = contributing.map((row) => row.liveMinutes);
  totals.liveMinutes = minutes.some((value) => value === null)
    ? null
    : minutes.reduce<number>((sum, value) => sum + value!, 0);

  return { totals, excluded: rows.length - contributing.length };
}

function sumTargets(rows: DashboardSessionRow[]): Decimal | null {
  const targets = rows.map((row) => row.targetGmv).filter((value): value is string => value !== null);
  // No target set anywhere means no achievement to report — not nought percent.
  if (targets.length === 0) return null;
  return targets.reduce<Decimal>((sum, value) => sum.plus(new Decimal(value)), new Decimal(0));
}

function toNumber(value: string | null): number {
  return value === null ? 0 : Number(value);
}

function buildDaily(rows: DashboardSessionRow[]): DailyPoint[] {
  const byDate = new Map<string, DashboardSessionRow[]>();
  for (const row of rows) {
    const bucket = byDate.get(row.sessionDate);
    if (bucket) bucket.push(row);
    else byDate.set(row.sessionDate, [row]);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayRows]) => {
      const targets = sumTargets(dayRows.filter((row) => row.ownership === 'AGENCY'));
      return {
        date,
        label: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
        agencyGmv: dayRows
          .filter((row) => row.ownership === 'AGENCY')
          .reduce((sum, row) => sum + toNumber(row.gmv), 0),
        inhouseGmv: dayRows
          .filter((row) => row.ownership === 'BRAND_INHOUSE')
          .reduce((sum, row) => sum + toNumber(row.gmv), 0),
        targetGmv: targets === null ? null : targets.toNumber(),
        hasUnallocated: dayRows.some((row) => row.hasUnallocated),
      };
    });
}

function buildHosts(rows: DashboardSessionRow[]): HostRow[] {
  const byHost = new Map<string, DashboardSessionRow[]>();

  for (const row of rows) {
    // Only agency shifts, and only shifts whose figures belong to someone: a
    // stretch shared between shifts is nobody's personal result (docs/05 §8.1).
    if (row.ownership !== 'AGENCY') continue;
    for (const name of row.hostNames) {
      const bucket = byHost.get(name);
      if (bucket) bucket.push(row);
      else byHost.set(name, [row]);
    }
  }

  return [...byHost.entries()]
    .map(([name, hostRows]) => {
      const attributable = hostRows.filter((row) => !row.hasUnallocated);
      const { totals } = sumRows(attributable);

      return {
        name,
        sessions: hostRows.length,
        gmvDisplay: formatMoney(totals.gmv),
        gmvPerHourDisplay: formatMoney(gmvPerHour(totals)),
        aovDisplay: formatMoney(aov(totals)),
        liveHoursDisplay: formatDuration(totals.liveMinutes),
        unallocatedSessions: hostRows.length - attributable.length,
      };
    })
    .sort((a, b) => b.sessions - a.sessions);
}

function buildQuality(rows: DashboardSessionRow[], unallocatedGmv: Decimal | null): QualityRow[] {
  const total = rows.length;
  const high = rows.filter((row) => row.confidence === 'HIGH').length;
  const pending = rows.filter((row) => row.status === 'DATA_PENDING').length;
  const unknown = rows.filter((row) => row.ownership === 'UNKNOWN').length;
  const highShare = total === 0 ? null : (high / total) * 100;

  return [
    {
      label: 'Ca có dữ liệu tin cậy',
      value: total === 0 ? NOT_AVAILABLE : `${high}/${total}`,
      status: highShare === null || highShare >= 80 ? 'good' : highShare >= 50 ? 'warning' : 'critical',
      note: highShare === null ? null : `${highShare.toFixed(0)}% số ca`,
    },
    {
      label: 'Ca chờ dữ liệu',
      value: String(pending),
      status: pending === 0 ? 'good' : 'warning',
      note: pending === 0 ? null : 'Nhắc trợ live nộp report',
    },
    {
      label: 'Đoạn chưa rõ ai vận hành',
      value: String(unknown),
      status: unknown === 0 ? 'good' : 'warning',
      note: unknown === 0 ? null : 'Chưa vào KPI nào cho tới khi xác nhận',
    },
    {
      // The most telling number here: money nobody can claim because a report
      // was not downloaded at the handover (docs/05 §9).
      label: 'GMV chưa quy kết được',
      value: formatMoney(unallocatedGmv),
      status: unallocatedGmv === null || unallocatedGmv.isZero() ? 'good' : 'critical',
      note:
        unallocatedGmv === null || unallocatedGmv.isZero()
          ? 'Mọi đồng doanh thu đều quy được về một ca'
          : 'Thiếu report ở ranh giới bàn giao — càng nhỏ càng tốt',
    },
  ];
}

export function buildBrandDashboard(
  rows: DashboardSessionRow[],
  periodLabel: string,
  unallocatedGmv: Decimal | null = null,
): BrandDashboard {
  // Agency performance counts agency shifts only, in numerator and denominator
  // alike. In-house is reported beside it, never inside it (docs/01 §3).
  const agency = rows.filter((row) => row.ownership === 'AGENCY');
  const inhouse = rows.filter((row) => row.ownership === 'BRAND_INHOUSE');

  const { totals, excluded } = sumRows(agency);
  const target = sumTargets(agency.filter((row) => !row.hasUnallocated && row.gmv !== null));
  const { totals: inhouseTotals } = sumRows(inhouse);

  const shopGmv =
    totals.gmv === null || inhouseTotals.gmv === null
      ? null
      : totals.gmv.plus(inhouseTotals.gmv);
  const inhouseShare =
    shopGmv === null || shopGmv.isZero() || inhouseTotals.gmv === null
      ? null
      : inhouseTotals.gmv.dividedBy(shopGmv).times(100).toNumber();

  return {
    gmvDisplay: formatMoney(totals.gmv),
    periodLabel,
    excludedSessions: excluded,
    tiles: [
      {
        label: 'Đạt target',
        value: formatPercent(targetAchievement(totals.gmv, target)),
        caveat:
          target === null
            ? 'Chưa ca nào đặt target'
            : `So với target của ${agency.length - excluded} ca đã quy kết · chênh lệch ${formatMoney(targetGap(totals.gmv, target))}`,
      },
      { label: 'Số ca', value: String(agency.length), caveat: null },
      { label: 'Giờ live', value: formatDuration(totals.liveMinutes), caveat: null },
      { label: 'GMV / giờ', value: formatMoney(gmvPerHour(totals)), caveat: null },
      { label: 'AOV', value: formatMoney(aov(totals)), caveat: null },
      {
        label: 'CVR (trên click)',
        value: formatPercent(conversionRateOnClicks(totals)),
        caveat: 'Mẫu số là lượt click sản phẩm',
      },
      { label: 'CTR sản phẩm', value: formatPercent(productCtr(totals)), caveat: null },
      {
        label: 'Đơn',
        value: totals.orders === null ? NOT_AVAILABLE : String(totals.orders),
        caveat: null,
      },
    ],
    daily: buildDaily(rows),
    inhouseGmvDisplay: formatMoney(inhouseTotals.gmv),
    inhouseShareLabel:
      inhouseShare === null ? null : `${inhouseShare.toFixed(0)}% GMV toàn shop kỳ này`,
    hosts: buildHosts(rows),
    quality: buildQuality(rows, unallocatedGmv),
  };
}
