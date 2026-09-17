import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import type { Decimal } from 'decimal.js';
import {
  ParseError,
  parseDecimalNumber,
  parseDuration,
  parseInteger,
  parseMoney,
  parsePercent,
  parseRoomId,
  parseTimestamp,
} from './primitives';

export const LIVE_SHEET_NAME = 'performance_detail';
const PERIOD_ROW = 1;
const HEADER_ROW = 3;
const FIRST_DATA_ROW = 4;

/**
 * Cumulative fields are the only ones a shift split may subtract between two
 * snapshots; everything else is recomputed from these (docs/05 §1.4).
 */
export const CUMULATIVE_FIELDS = [
  'gmv',
  'itemsSold',
  'orders',
  'skuOrders',
  'customers',
  'views',
  'impressions',
  'productImpressions',
  'productClicks',
  'newFollowers',
  'comments',
  'shares',
  'likes',
] as const;

export type CumulativeField = (typeof CUMULATIVE_FIELDS)[number];

type ColumnKind = 'roomId' | 'text' | 'timestamp' | 'duration' | 'money' | 'count' | 'percent' | 'number';

interface ColumnSpec {
  header: string;
  field: string;
  kind: ColumnKind;
  cumulative?: CumulativeField;
}

/** Column order and names as they appear in the real export (docs/03 §A.4). */
export const LIVE_COLUMNS: ColumnSpec[] = [
  { header: 'Room ID', field: 'platformRoomId', kind: 'roomId' },
  { header: 'Room Title', field: 'roomTitle', kind: 'text' },
  { header: 'Start Time', field: 'roomStartAt', kind: 'timestamp' },
  { header: 'End Time', field: 'snapshotEndAt', kind: 'timestamp' },
  { header: 'Duration', field: 'durationMinutes', kind: 'duration' },
  { header: 'Attributed GMV', field: 'gmv', kind: 'money', cumulative: 'gmv' },
  { header: 'Attributed items sold', field: 'itemsSold', kind: 'count', cumulative: 'itemsSold' },
  { header: 'Attributed orders', field: 'orders', kind: 'count', cumulative: 'orders' },
  { header: 'Attributed SKU orders', field: 'skuOrders', kind: 'count', cumulative: 'skuOrders' },
  { header: 'Customers', field: 'customers', kind: 'count', cumulative: 'customers' },
  { header: 'AOV', field: 'aov', kind: 'money' },
  { header: 'Views', field: 'views', kind: 'count', cumulative: 'views' },
  { header: 'Impressions', field: 'impressions', kind: 'count', cumulative: 'impressions' },
  { header: 'Impressions Per Hour', field: 'impressionsPerHour', kind: 'number' },
  { header: 'GMV per hour', field: 'gmvPerHour', kind: 'money' },
  { header: 'Show GPM', field: 'showGpm', kind: 'money' },
  { header: 'Watch GPM', field: 'watchGpm', kind: 'money' },
  { header: 'Avg. viewing duration per view', field: 'avgViewDurationPerView', kind: 'number' },
  { header: 'Avg. viewing duration', field: 'avgViewDuration', kind: 'number' },
  { header: 'Tap through rate', field: 'tapThroughRate', kind: 'percent' },
  { header: 'LIVE CTR', field: 'liveCtr', kind: 'percent' },
  { header: 'Product Impressions', field: 'productImpressions', kind: 'count', cumulative: 'productImpressions' },
  { header: 'Product clicks', field: 'productClicks', kind: 'count', cumulative: 'productClicks' },
  { header: 'CTR', field: 'ctr', kind: 'percent' },
  { header: 'CTOR', field: 'ctor', kind: 'percent' },
  { header: 'CTOR (SKU orders)', field: 'ctorSkuOrders', kind: 'percent' },
  { header: 'SKU order rate', field: 'skuOrderRate', kind: 'percent' },
  { header: 'New followers', field: 'newFollowers', kind: 'count', cumulative: 'newFollowers' },
  { header: 'Follow rate', field: 'followRate', kind: 'percent' },
  { header: 'Comments', field: 'comments', kind: 'count', cumulative: 'comments' },
  { header: 'Comment rate', field: 'commentRate', kind: 'percent' },
  { header: 'Shares', field: 'shares', kind: 'count', cumulative: 'shares' },
  { header: 'Share rate', field: 'shareRate', kind: 'percent' },
  { header: 'Likes', field: 'likes', kind: 'count', cumulative: 'likes' },
  { header: 'Like rate', field: 'likeRate', kind: 'percent' },
];

export interface CumulativeMetrics {
  gmv: Decimal | null;
  itemsSold: number | null;
  orders: number | null;
  skuOrders: number | null;
  customers: number | null;
  views: number | null;
  impressions: number | null;
  productImpressions: number | null;
  productClicks: number | null;
  newFollowers: number | null;
  comments: number | null;
  shares: number | null;
  likes: number | null;
}

export interface LiveSnapshotRow {
  rowIndex: number;
  rawValues: Record<string, string | null>;
  platformRoomId: string;
  roomTitle: string | null;
  roomStartAt: Date;
  snapshotEndAt: Date;
  durationMinutes: number | null;
  metrics: CumulativeMetrics;
  /** Values TikTok already derived; kept for reconciliation only, never subtracted. */
  reportedDerived: Record<string, number | null>;
}

export interface FailedRow {
  rowIndex: number;
  rawValues: Record<string, string | null>;
  reason: string;
}

export type LiveParseResult =
  | {
      status: 'NEEDS_MAPPING';
      headerSignature: string;
      headers: string[];
      missingColumns: string[];
      unexpectedColumns: string[];
    }
  | {
      status: 'PARSED';
      headerSignature: string;
      dataPeriod: { start: string; end: string } | null;
      rows: LiveSnapshotRow[];
      failedRows: FailedRow[];
    };

export function headerSignature(headers: string[]): string {
  return createHash('sha256').update(headers.map((h) => h.trim()).join('')).digest('hex');
}

function cellText(cell: ExcelJS.Cell): string | null {
  const { value } = cell;
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'text' in value) return String(value.text);
  if (typeof value === 'object' && 'result' in value) return String(value.result ?? '');
  return String(value);
}

function parsePeriod(raw: string | null): { start: string; end: string } | null {
  if (!raw) return null;
  const match = /^(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})$/.exec(raw.trim());
  return match ? { start: match[1], end: match[2] } : null;
}

export async function parseLivePerformanceWorkbook(source: Buffer | string): Promise<LiveParseResult> {
  const workbook = new ExcelJS.Workbook();
  if (typeof source === 'string') {
    await workbook.xlsx.readFile(source);
  } else {
    await workbook.xlsx.load(source);
  }

  const sheet = workbook.getWorksheet(LIVE_SHEET_NAME);
  if (!sheet) {
    throw new ParseError(
      'sheet',
      workbook.worksheets.map((w) => w.name),
      `không tìm thấy sheet "${LIVE_SHEET_NAME}"`,
    );
  }

  const headerRow = sheet.getRow(HEADER_ROW);
  const headers: string[] = [];
  for (let col = 1; col <= LIVE_COLUMNS.length; col += 1) {
    headers.push((cellText(headerRow.getCell(col)) ?? '').trim());
  }
  const signature = headerSignature(headers);

  const expected = LIVE_COLUMNS.map((c) => c.header);
  const missingColumns = expected.filter((h) => !headers.includes(h));
  const unexpectedColumns = headers.filter((h) => h !== '' && !expected.includes(h));

  // An unknown layout is never guessed at — it goes to manual mapping instead.
  if (missingColumns.length > 0 || unexpectedColumns.length > 0) {
    return { status: 'NEEDS_MAPPING', headerSignature: signature, headers, missingColumns, unexpectedColumns };
  }

  const columnIndexByHeader = new Map(headers.map((header, index) => [header, index + 1]));
  const dataPeriod = parsePeriod(cellText(sheet.getRow(PERIOD_ROW).getCell(1)));

  const rows: LiveSnapshotRow[] = [];
  const failedRows: FailedRow[] = [];

  for (let rowIndex = FIRST_DATA_ROW; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    const rawValues: Record<string, string | null> = {};
    for (const column of LIVE_COLUMNS) {
      rawValues[column.header] = cellText(row.getCell(columnIndexByHeader.get(column.header)!));
    }

    const isBlank = Object.values(rawValues).every((value) => value === null || value === '');
    if (isBlank) continue;

    try {
      rows.push(buildSnapshotRow(rowIndex, rawValues));
    } catch (error) {
      failedRows.push({
        rowIndex,
        rawValues,
        reason: error instanceof ParseError ? error.message : String(error),
      });
    }
  }

  return { status: 'PARSED', headerSignature: signature, dataPeriod, rows, failedRows };
}

function buildSnapshotRow(rowIndex: number, rawValues: Record<string, string | null>): LiveSnapshotRow {
  const metrics = {} as CumulativeMetrics;
  const reportedDerived: Record<string, number | null> = {};
  let platformRoomId = '';
  let roomTitle: string | null = null;
  let roomStartAt: Date | null = null;
  let snapshotEndAt: Date | null = null;
  let durationMinutes: number | null = null;

  for (const column of LIVE_COLUMNS) {
    const raw = rawValues[column.header];

    switch (column.kind) {
      case 'roomId':
        platformRoomId = parseRoomId(raw, column.header);
        break;
      case 'text':
        roomTitle = raw;
        break;
      case 'timestamp': {
        const value = parseTimestamp(raw, column.header);
        if (column.field === 'roomStartAt') roomStartAt = value;
        else snapshotEndAt = value;
        break;
      }
      case 'duration':
        durationMinutes = parseDuration(raw, column.header);
        break;
      case 'money': {
        const value = parseMoney(raw, column.header);
        if (column.cumulative) metrics.gmv = value;
        else reportedDerived[column.field] = value === null ? null : value.toNumber();
        break;
      }
      case 'count': {
        const value = parseInteger(raw, column.header);
        if (column.cumulative) {
          (metrics as Record<string, unknown>)[column.cumulative] = value;
        }
        break;
      }
      case 'percent':
        reportedDerived[column.field] = parsePercent(raw, column.header);
        break;
      case 'number':
        reportedDerived[column.field] = parseDecimalNumber(raw, column.header);
        break;
    }
  }

  if (!roomStartAt || !snapshotEndAt) {
    throw new ParseError('Start Time / End Time', rawValues, 'thiếu mốc thời gian bắt buộc');
  }
  if (snapshotEndAt.getTime() < roomStartAt.getTime()) {
    throw new ParseError('End Time', rawValues['End Time'], 'kết thúc trước thời điểm bắt đầu phòng live');
  }

  return {
    rowIndex,
    rawValues,
    platformRoomId,
    roomTitle,
    roomStartAt,
    snapshotEndAt,
    durationMinutes,
    metrics,
    reportedDerived,
  };
}
