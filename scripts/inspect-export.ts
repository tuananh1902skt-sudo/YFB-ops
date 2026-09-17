/**
 * Kiểm tra nhanh một file export TikTok thật:
 *   npx tsx scripts/inspect-export.ts <đường-dẫn-file.xlsx>
 *
 * Dùng khi nghi ngờ TikTok đổi cấu trúc file, hoặc để đối chiếu số liệu
 * parser đọc được với số hiển thị trên giao diện TikTok.
 */
import { Decimal } from 'decimal.js';
import { parseAdsDailyWorkbook } from '../src/lib/parsing/ads-daily';
import { parseLivePerformanceWorkbook } from '../src/lib/parsing/live-performance';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Thiếu đường dẫn file. Ví dụ: npx tsx scripts/inspect-export.ts ./Creator-Live-Performance.xlsx');
  process.exit(1);
}

const isAdsFile = /campaign_overview/i.test(filePath);

async function inspectLive(path: string) {
  const result = await parseLivePerformanceWorkbook(path);
  if (result.status === 'NEEDS_MAPPING') {
    console.log('Cần mapping thủ công — cấu trúc file không khớp.');
    console.log('  Thiếu cột   :', result.missingColumns);
    console.log('  Cột lạ      :', result.unexpectedColumns);
    return;
  }

  const totalGmv = result.rows.reduce((sum, row) => sum.plus(row.metrics.gmv ?? 0), new Decimal(0));
  const rooms = new Set(result.rows.map((row) => row.platformRoomId));

  console.log('File hiệu suất live');
  console.log('  Khoảng thời gian :', result.dataPeriod);
  console.log('  Dòng đọc được    :', result.rows.length);
  console.log('  Dòng lỗi         :', result.failedRows.length);
  console.log('  Số Room khác nhau:', rooms.size);
  console.log('  Tổng GMV         :', totalGmv.toFixed(2), '₫');

  for (const failed of result.failedRows) {
    console.log(`  ! dòng ${failed.rowIndex}: ${failed.reason}`);
  }
}

async function inspectAds(path: string) {
  const result = await parseAdsDailyWorkbook(path);
  if (result.status === 'NEEDS_MAPPING') {
    console.log('Cần mapping thủ công — cấu trúc file không khớp.');
    console.log('  Thiếu cột:', result.missingColumns);
    return;
  }

  const totalSpend = result.rows.reduce((sum, row) => sum.plus(row.adsSpend), new Decimal(0));

  console.log('File chi phí ads');
  console.log('  Dòng đọc được   :', result.rows.length);
  console.log('  Dòng lỗi        :', result.failedRows.length);
  console.log('  Dòng tổng bị loại:', result.totalsRowSkipped);
  console.log('  Tổng chi phí    :', totalSpend.toFixed(0), '₫');
  console.log('  (Đối chiếu con số này với dòng tổng cuối file trên TikTok)');

  for (const failed of result.failedRows) {
    console.log(`  ! dòng ${failed.rowIndex}: ${failed.reason}`);
  }
}

(isAdsFile ? inspectAds(filePath) : inspectLive(filePath)).catch((error) => {
  console.error('Không đọc được file:', error instanceof Error ? error.message : error);
  process.exit(1);
});
