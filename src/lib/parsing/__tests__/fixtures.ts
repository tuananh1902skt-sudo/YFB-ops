import ExcelJS from 'exceljs';
import { ADS_COLUMNS } from '../ads-daily';
import { LIVE_COLUMNS, LIVE_SHEET_NAME } from '../live-performance';

/**
 * Fixtures mirror the real exports cell for cell: every value is written as a
 * string, because that is how TikTok writes them — including the numbers.
 */

export interface LiveRowInput {
  roomId: string;
  title?: string;
  start: string;
  end: string;
  duration: string;
  gmv: string;
  itemsSold?: string;
  orders?: string;
  skuOrders?: string;
  customers?: string;
  views?: string;
  productImpressions?: string;
  productClicks?: string;
  liveCtr?: string;
  likeRate?: string;
  likes?: string;
}

const LIVE_DEFAULTS: Record<string, string> = {
  'Attributed items sold': '0',
  'Attributed orders': '0',
  'Attributed SKU orders': '0',
  Customers: '0',
  AOV: '0.00₫',
  Views: '0',
  Impressions: '0',
  'Impressions Per Hour': '0',
  'GMV per hour': '0.00₫',
  'Show GPM': '0.00₫',
  'Watch GPM': '0.00₫',
  'Avg. viewing duration per view': '0',
  'Avg. viewing duration': '0',
  'Tap through rate': '0%',
  'LIVE CTR': '0%',
  'Product Impressions': '0',
  'Product clicks': '0',
  CTR: '0%',
  CTOR: '0%',
  'CTOR (SKU orders)': '0%',
  'SKU order rate': '0%',
  'New followers': '0',
  'Follow rate': '0%',
  Comments: '0',
  'Comment rate': '0%',
  Shares: '0',
  'Share rate': '0%',
  Likes: '0',
  'Like rate': '0%',
};

export async function buildLiveWorkbook(
  rows: LiveRowInput[],
  options: { period?: string; headerOverrides?: Record<string, string> } = {},
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(LIVE_SHEET_NAME);

  sheet.getRow(1).getCell(1).value = options.period ?? '2026-07-01 ~ 2026-09-17';

  LIVE_COLUMNS.forEach((column, index) => {
    const header = options.headerOverrides?.[column.header] ?? column.header;
    sheet.getRow(3).getCell(index + 1).value = header;
  });

  rows.forEach((input, rowOffset) => {
    const values: Record<string, string> = {
      ...LIVE_DEFAULTS,
      'Room ID': input.roomId,
      'Room Title': input.title ?? 'FRANKLIN IS BACK! SPECIAL LIVE',
      'Start Time': input.start,
      'End Time': input.end,
      Duration: input.duration,
      'Attributed GMV': input.gmv,
    };

    if (input.itemsSold !== undefined) values['Attributed items sold'] = input.itemsSold;
    if (input.orders !== undefined) values['Attributed orders'] = input.orders;
    if (input.skuOrders !== undefined) values['Attributed SKU orders'] = input.skuOrders;
    if (input.customers !== undefined) values.Customers = input.customers;
    if (input.views !== undefined) values.Views = input.views;
    if (input.productImpressions !== undefined) values['Product Impressions'] = input.productImpressions;
    if (input.productClicks !== undefined) values['Product clicks'] = input.productClicks;
    if (input.liveCtr !== undefined) values['LIVE CTR'] = input.liveCtr;
    if (input.likes !== undefined) values.Likes = input.likes;
    if (input.likeRate !== undefined) values['Like rate'] = input.likeRate;

    const row = sheet.getRow(4 + rowOffset);
    LIVE_COLUMNS.forEach((column, index) => {
      row.getCell(index + 1).value = values[column.header];
    });
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export interface AdsRowInput {
  date: string;
  spend: string;
  skuOrders: string;
  costPerOrder: string;
  grossRevenue: string;
  roi: string;
}

export async function buildAdsWorkbook(
  rows: AdsRowInput[],
  options: { includeTotalsRow?: boolean } = {},
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');

  ADS_COLUMNS.forEach((header, index) => {
    sheet.getRow(1).getCell(index + 1).value = header;
  });

  rows.forEach((input, rowOffset) => {
    const row = sheet.getRow(2 + rowOffset);
    row.getCell(1).value = `${input.date} 00:00:00`;
    row.getCell(2).value = input.spend;
    row.getCell(3).value = input.skuOrders;
    row.getCell(4).value = input.costPerOrder;
    row.getCell(5).value = input.grossRevenue;
    row.getCell(6).value = input.roi;
    row.getCell(7).value = 'VND';
  });

  if (options.includeTotalsRow) {
    const totalSpend = rows.reduce((sum, r) => sum + Number(r.spend), 0);
    const totalOrders = rows.reduce((sum, r) => sum + Number(r.skuOrders), 0);
    const totalRevenue = rows.reduce((sum, r) => sum + Number(r.grossRevenue), 0);
    const row = sheet.getRow(2 + rows.length);
    row.getCell(1).value = '-';
    row.getCell(2).value = String(totalSpend);
    row.getCell(3).value = String(totalOrders);
    row.getCell(4).value = '0';
    row.getCell(5).value = String(totalRevenue);
    row.getCell(6).value = '0.00';
    row.getCell(7).value = 'VND';
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
