import { Decimal } from 'decimal.js';
import type { DataConfidence } from '../attribution/types';
import {
  NOT_AVAILABLE,
  formatDuration,
  formatMoney,
  formatPercent,
  formatRatio,
  formatTime,
  formatTimeRange,
} from '../format';
import {
  aov,
  conversionRateOnClicks,
  gmvPerHour,
  gmvPerView,
  itemsPerOrder,
  ordersPerHour,
  productCtr,
  targetAchievement,
  targetGap,
  type MetricTotals,
} from '../kpi/formulas';
import { EVENT_LABELS } from './console-view';
import type { DetailAttribution, SessionDetail } from './detail-types';

export interface PlanActualRow {
  label: string;
  planned: string;
  actual: string;
  /** Set when the two differ in a way someone will ask about. */
  note: string | null;
}

export interface LineageStep {
  label: string;
  amount: string;
  operation: 'BASE' | 'SUBTRACT' | 'RESULT';
  /** The upload this figure came from, for opening the original file. */
  importId: string | null;
  fileName: string | null;
}

export interface LineageBlock {
  attributionId: string;
  roomLabel: string;
  methodLabel: string;
  windowLabel: string;
  durationLabel: string;
  steps: LineageStep[];
  note: string | null;
}

export interface KpiRow {
  label: string;
  value: string;
  /** Why this figure cannot be taken at face value, if anything. */
  caveat: string | null;
}

export interface HistoryEntry {
  at: string;
  timeLabel: string;
  title: string;
  detail: string | null;
  actorName: string | null;
}

export interface SessionDetailView {
  sessionId: string;
  title: string;
  brandName: string;
  hostNames: string[];
  assistantNames: string[];
  ownershipLabel: string | null;
  confidence: DataConfidence | null;
  confidenceLabel: string | null;
  countsTowardAgency: boolean;
  planActual: PlanActualRow[];
  lineage: LineageBlock[];
  gmvDisplay: string;
  kpis: KpiRow[];
  history: HistoryEntry[];
  eventCount: number;
}

const METHOD_LABELS: Record<string, string> = {
  FULL_SNAPSHOT: 'Đoạn đầu của phòng live',
  SNAPSHOT_DELTA: 'Trừ snapshot của ca trước',
  ROOM_SUM: 'Cộng nhiều đoạn phòng live',
  MANUAL: 'Operation nhập tay',
  SHARED_UNALLOCATED: 'Chưa quy kết được',
};

const CONFIDENCE_LABELS: Record<DataConfidence, string | null> = {
  HIGH: null,
  MEDIUM: 'Xấp xỉ',
  LOW: 'Chưa quy kết',
  NEEDS_REVIEW: 'Cần rà soát',
};

/**
 * Audit actions are stored as codes so they stay stable across releases; nobody
 * outside the code should ever read one (docs/06 §7).
 */
const AUDIT_LABELS: Record<string, string> = {
  OWNERSHIP_CONFIRMED: 'Operation xác nhận ai vận hành ca',
  MERGED_INTO_SESSION: 'Gộp đoạn live vào ca này',
  WINDOW_EXTENDED_BY_MERGE: 'Mở rộng khung giờ thực tế do gộp đoạn live',
  MISMATCH_REPORTED: 'Trợ live báo số liệu không khớp',
  OVERWRITE: 'Ghi đè số liệu bằng file mới hơn',
};

const OWNERSHIP_LABELS: Record<string, string | null> = {
  AGENCY: null,
  BRAND_INHOUSE: 'Brand tự live',
  UNKNOWN: 'Chưa rõ ai vận hành',
};

function instant(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

function minutesBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 60_000;
}

function rangeLabel(start: string | null, end: string | null): string {
  const from = instant(start);
  const to = instant(end);
  if (!from || !to) return NOT_AVAILABLE;
  return formatTimeRange(from, to);
}

function buildPlanActual(detail: SessionDetail): PlanActualRow[] {
  const plannedStart = instant(detail.plannedStartAt);
  const plannedEnd = instant(detail.plannedEndAt);
  const actualStart = instant(detail.actualStartAt);
  const actualEnd = instant(detail.actualEndAt);

  const rows: PlanActualRow[] = [
    {
      label: 'Bắt đầu',
      planned: plannedStart ? formatTime(plannedStart) : NOT_AVAILABLE,
      actual: actualStart ? formatTime(actualStart) : 'chưa ghi nhận',
      note:
        plannedStart && actualStart && Math.abs(minutesBetween(plannedStart, actualStart)) >= 5
          ? `Lệch ${formatDuration(Math.abs(minutesBetween(plannedStart, actualStart)))} so với kế hoạch`
          : null,
    },
    {
      label: 'Kết thúc',
      planned: plannedEnd ? formatTime(plannedEnd) : NOT_AVAILABLE,
      actual: actualEnd ? formatTime(actualEnd) : 'chưa ghi nhận',
      note: null,
    },
  ];

  if (plannedEnd && actualEnd) {
    const difference = minutesBetween(plannedEnd, actualEnd);
    // Achievement is measured against what happened, so an early finish or
    // overtime has to be visible next to the target (docs/01 §4).
    if (difference <= -5) {
      rows[1].note = `Off sớm ${formatDuration(Math.abs(difference))}`;
    } else if (difference >= 5) {
      rows[1].note = `OT ${formatDuration(difference)}`;
    }
  }

  const plannedMinutes =
    plannedStart && plannedEnd ? minutesBetween(plannedStart, plannedEnd) : null;
  const actualMinutes = detail.attributions
    .filter((row) => row.isCurrent)
    .reduce<number | null>((total, row) => {
      if (total === null || row.durationMinutes === null) return null;
      return total + row.durationMinutes;
    }, 0);

  rows.push({
    label: 'Thời lượng live',
    planned: formatDuration(plannedMinutes),
    actual: formatDuration(actualMinutes),
    // The platform's Duration column covers the whole room, which for a
    // handed-over shift is several times too long (docs/05 §2.1).
    note: 'Tính từ mốc snapshot của riêng ca này, không lấy cột Duration của file',
  });

  return rows;
}

function buildLineage(detail: SessionDetail): LineageBlock[] {
  return detail.attributions
    .filter((row) => row.isCurrent)
    .map((row) => {
      const steps: LineageStep[] = [];

      if (row.sourceSnapshot) {
        steps.push({
          label: `Số cộng dồn lúc ${formatTime(new Date(row.sourceSnapshot.endAt))}`,
          amount: formatMoney(row.sourceSnapshot.gmv),
          operation: 'BASE',
          importId: row.sourceSnapshot.importId,
          fileName: row.sourceSnapshot.fileName,
        });
      }
      if (row.previousSnapshot) {
        steps.push({
          label: `Trừ số cộng dồn lúc ${formatTime(new Date(row.previousSnapshot.endAt))}`,
          amount: formatMoney(row.previousSnapshot.gmv),
          operation: 'SUBTRACT',
          importId: row.previousSnapshot.importId,
          fileName: row.previousSnapshot.fileName,
        });
      }
      steps.push({
        label: 'Kết quả đoạn này',
        amount: row.method === 'SHARED_UNALLOCATED' ? 'Gộp chung' : formatMoney(row.gmv),
        operation: 'RESULT',
        importId: null,
        fileName: null,
      });

      return {
        attributionId: row.id,
        roomLabel: row.platformRoomId ? `Room …${row.platformRoomId.slice(-6)}` : 'Room không rõ',
        methodLabel: METHOD_LABELS[row.method] ?? row.method,
        windowLabel: rangeLabel(row.segmentStartAt, row.segmentEndAt),
        durationLabel: formatDuration(row.durationMinutes),
        steps,
        note: row.overrideReason ?? row.computedReason,
      };
    });
}

function totalsFrom(rows: DetailAttribution[]): MetricTotals {
  const current = rows.filter((row) => row.isCurrent);
  const sum = (pick: (row: DetailAttribution) => number | null): number | null =>
    current.reduce<number | null>((total, row) => {
      const value = pick(row);
      if (total === null || value === null) return null;
      return total + value;
    }, 0);

  const gmvValues = current.map((row) => row.gmv);
  return {
    gmv: gmvValues.some((value) => value === null)
      ? null
      : gmvValues.reduce<Decimal>((total, value) => total.plus(new Decimal(value!)), new Decimal(0)),
    orders: sum((row) => row.orders),
    itemsSold: sum((row) => row.itemsSold),
    skuOrders: null,
    customers: sum((row) => row.customers),
    views: sum((row) => row.views),
    impressions: null,
    productImpressions: sum((row) => row.productImpressions),
    productClicks: sum((row) => row.productClicks),
    newFollowers: sum((row) => row.newFollowers),
    comments: null,
    shares: null,
    likes: null,
    liveMinutes: sum((row) => row.durationMinutes),
  };
}

/**
 * Every derived figure is recomputed from the split totals rather than taken
 * from the export or differenced between snapshots (CLAUDE.md §7), and all of
 * them come from the one KPI service so the same number appears everywhere.
 */
function buildKpis(detail: SessionDetail, totals: MetricTotals): KpiRow[] {
  const target = detail.targetGmv === null ? null : new Decimal(detail.targetGmv);

  return [
    { label: 'GMV', value: formatMoney(totals.gmv), caveat: null },
    { label: 'Đơn', value: totals.orders === null ? NOT_AVAILABLE : String(totals.orders), caveat: null },
    { label: 'AOV', value: formatMoney(aov(totals)), caveat: null },
    { label: 'GMV / giờ', value: formatMoney(gmvPerHour(totals)), caveat: null },
    { label: 'Đơn / giờ', value: formatRatio(ordersPerHour(totals)), caveat: null },
    { label: 'Sản phẩm / đơn', value: formatRatio(itemsPerOrder(totals), 2), caveat: null },
    { label: 'CTR sản phẩm', value: formatPercent(productCtr(totals)), caveat: null },
    {
      label: 'CVR (trên click)',
      value: formatPercent(conversionRateOnClicks(totals)),
      caveat: 'Mẫu số là lượt click sản phẩm',
    },
    { label: 'GMV / view', value: formatMoney(gmvPerView(totals)), caveat: null },
    {
      label: 'Khách mua',
      value: totals.customers === null ? NOT_AVAILABLE : String(totals.customers),
      // A customer who bought in both halves of a handover is counted once in
      // each running total, so the difference loses them (docs/05 §4).
      caveat: 'Xấp xỉ ở cấp ca: khách mua ở cả hai ca nối sẽ bị đếm hụt khi trừ delta',
    },
    {
      label: 'Đạt target',
      value: formatPercent(targetAchievement(totals.gmv, target)),
      caveat:
        target === null
          ? 'Ca này chưa đặt target — không quy ra 0%'
          : `Chênh lệch ${formatMoney(targetGap(totals.gmv, target))}`,
    },
  ];
}

function buildHistory(detail: SessionDetail): HistoryEntry[] {
  const entries: HistoryEntry[] = [
    ...detail.events.map((event) => ({
      at: event.occurredAt,
      timeLabel: formatTime(new Date(event.occurredAt)),
      title: EVENT_LABELS[event.eventType] ?? event.eventType,
      detail: event.reason,
      actorName: event.actorName,
    })),
    // Superseded rows stay in the database precisely so this list can show what
    // a figure used to be (docs/01 §6.9).
    ...detail.attributions
      .filter((row) => !row.isCurrent)
      .map((row) => ({
        at: row.computedAt,
        timeLabel: formatTime(new Date(row.computedAt)),
        title: 'Kết quả cũ, đã được tính lại',
        detail: `${METHOD_LABELS[row.method] ?? row.method} · ${
          row.method === 'SHARED_UNALLOCATED' ? 'Gộp chung' : formatMoney(row.gmv)
        }`,
        actorName: null,
      })),
    ...detail.auditLogs.map((entry) => ({
      at: entry.createdAt,
      timeLabel: formatTime(new Date(entry.createdAt)),
      title: AUDIT_LABELS[entry.action] ?? 'Thay đổi được ghi nhận',
      detail: entry.reason,
      actorName: entry.actorName,
    })),
  ];

  return entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export function buildSessionDetailView(detail: SessionDetail): SessionDetailView {
  const totals = totalsFrom(detail.attributions);
  const unallocated = detail.attributions.some(
    (row) => row.isCurrent && row.method === 'SHARED_UNALLOCATED',
  );

  return {
    sessionId: detail.sessionId,
    title: `Ca ${detail.sessionDate} · ${rangeLabel(
      detail.actualStartAt ?? detail.plannedStartAt,
      detail.actualEndAt ?? detail.plannedEndAt,
    )}`,
    brandName: detail.brandName,
    hostNames: detail.staff.filter((person) => person.role === 'HOST').map((person) => person.name),
    assistantNames: detail.staff
      .filter((person) => person.role === 'ASSISTANT')
      .map((person) => person.name),
    ownershipLabel: OWNERSHIP_LABELS[detail.ownership] ?? null,
    confidence: detail.confidence,
    confidenceLabel: detail.confidence ? CONFIDENCE_LABELS[detail.confidence] : null,
    // Agency KPI, target achievement and host performance count only AGENCY
    // shifts — in the numerator and the denominator alike (docs/01 §3).
    countsTowardAgency: detail.ownership === 'AGENCY',
    planActual: buildPlanActual(detail),
    lineage: buildLineage(detail),
    gmvDisplay: unallocated ? 'Gộp chung' : formatMoney(totals.gmv),
    kpis: buildKpis(detail, totals),
    history: buildHistory(detail),
    eventCount: detail.events.length,
  };
}
