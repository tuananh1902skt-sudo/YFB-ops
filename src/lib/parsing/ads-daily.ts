import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import type { Decimal } from 'decimal.js';
import { ParseError, parseInteger, parseMoney } from './primitives';
import type { FailedRow } from './live-performance';

export const ADS_SHEET_NAME = 'Sheet1';
const HEADER_ROW = 1;
const FIRST_DATA_ROW = 2;
/** The export's last row is a grand total; importing it would double every figure. */
const TOTALS_ROW_MARKER = '-';

/** Header names come from the Vietnamese TikTok Ads UI (docs/03 §B.2). */
export const ADS_COLUMNS = [
  'Theo ngày',
  'Chi phí',
  'Số lượng đơn hàng SKU (Cửa hàng hiện tại)',
  'Chi phí mỗi đơn hàng (Cửa hàng hiện tại)',
  'Doanh thu gộp (Cửa hàng hiện tại)',
  'ROI (Cửa hàng hiện tại)',
  'Tiền tệ',
] as const;

export interface AdsDailyRow {
  rowIndex: number;
  rawValues: Record<string, string | null>;
  statDate: string;
  adsSpend: Decimal;
  adsSkuOrders: number | null;
  adsGrossRevenue: Decimal | null;
  currency: string;
}

export type AdsParseResult =
  | {
      status: 'NEEDS_MAPPING';
      headerSignature: string;
      headers: string[];
      missingColumns: string[];
    }
  | {
      status: 'PARSED';
      headerSignature: string;
      rows: AdsDailyRow[];
      failedRows: FailedRow[];
      totalsRowSkipped: boolean;
    };

function cellText(cell: ExcelJS.Cell): string | null {
  const { value } = cell;
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'text' in value) return String(value.text);
  if (typeof value === 'object' && 'result' in value) return String(value.result ?? '');
  return String(value);
}

function parseStatDate(raw: string | null): string {
  if (!raw) throw new ParseError('Theo ngày', raw, 'không được để trống');
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim());
  if (!match) throw new ParseError('Theo ngày', raw, 'không đúng định dạng ngày');
  return match[1];
}

export async function parseAdsDailyWorkbook(source: Buffer | string): Promise<AdsParseResult> {
  const workbook = new ExcelJS.Workbook();
  if (typeof source === 'string') {
    await workbook.xlsx.readFile(source);
  } else {
    await workbook.xlsx.load(source);
  }

  const sheet = workbook.getWorksheet(ADS_SHEET_NAME) ?? workbook.worksheets[0];
  if (!sheet) {
    throw new ParseError('sheet', [], 'file không có sheet nào');
  }

  const headerRow = sheet.getRow(HEADER_ROW);
  const headers = ADS_COLUMNS.map((_, index) => (cellText(headerRow.getCell(index + 1)) ?? '').trim());
  const signature = createHash('sha256').update(headers.join('')).digest('hex');
  const missingColumns = ADS_COLUMNS.filter((header) => !headers.includes(header));

  if (missingColumns.length > 0) {
    return { status: 'NEEDS_MAPPING', headerSignature: signature, headers, missingColumns };
  }

  const columnIndexByHeader = new Map(headers.map((header, index) => [header, index + 1]));
  const rows: AdsDailyRow[] = [];
  const failedRows: FailedRow[] = [];
  let totalsRowSkipped = false;

  for (let rowIndex = FIRST_DATA_ROW; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    const rawValues: Record<string, string | null> = {};
    for (const header of ADS_COLUMNS) {
      rawValues[header] = cellText(row.getCell(columnIndexByHeader.get(header)!));
    }

    const dateCell = rawValues['Theo ngày'];
    if (dateCell === null || dateCell.trim() === '') continue;
    if (dateCell.trim() === TOTALS_ROW_MARKER) {
      totalsRowSkipped = true;
      continue;
    }

    try {
      const adsSpend = parseMoney(rawValues['Chi phí'], 'Chi phí');
      if (adsSpend === null) {
        throw new ParseError('Chi phí', rawValues['Chi phí'], 'không được để trống');
      }
      rows.push({
        rowIndex,
        rawValues,
        statDate: parseStatDate(dateCell),
        adsSpend,
        adsSkuOrders: parseInteger(
          rawValues['Số lượng đơn hàng SKU (Cửa hàng hiện tại)'],
          'Số lượng đơn hàng SKU',
        ),
        adsGrossRevenue: parseMoney(
          rawValues['Doanh thu gộp (Cửa hàng hiện tại)'],
          'Doanh thu gộp',
        ),
        currency: (rawValues['Tiền tệ'] ?? 'VND').trim(),
      });
    } catch (error) {
      failedRows.push({
        rowIndex,
        rawValues,
        reason: error instanceof ParseError ? error.message : String(error),
      });
    }
  }

  return { status: 'PARSED', headerSignature: signature, rows, failedRows, totalsRowSkipped };
}
