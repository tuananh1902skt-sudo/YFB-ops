/**
 * Chạy toàn bộ luồng import trên một file thật, dùng kho dữ liệu trong bộ nhớ:
 *   npx tsx scripts/dry-run-import.ts <file.xlsx> [file-2.xlsx ...]
 *
 * Không ghi vào database nào. Dùng để kiểm chứng tách ca trên dữ liệu thật và
 * để xem trước kết quả trước khi bấm lưu ở màn hình upload.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { Decimal } from 'decimal.js';
import { parseLivePerformanceWorkbook } from '../src/lib/parsing/live-performance';
import { importLivePerformance } from '../src/lib/ingest/live-import';
import { MemoryRepository } from '../src/lib/ingest/memory-repository';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Thiếu đường dẫn file. Ví dụ: npx tsx scripts/dry-run-import.ts ./report.xlsx');
  process.exit(1);
}

const ACCOUNT = 'dry-run-account';
const formatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  dateStyle: 'short',
  timeStyle: 'medium',
});

function money(value: Decimal | null): string {
  return value === null ? 'chưa quy kết' : `${value.toFixed(2)} ₫`;
}

async function main() {
  const repo = new MemoryRepository();

  for (const path of files) {
    const buffer = readFileSync(path);
    const parsed = await parseLivePerformanceWorkbook(buffer);
    const report = await importLivePerformance(
      repo,
      {
        platformAccountId: ACCOUNT,
        uploadedBy: 'dry-run-user',
        fileName: basename(path),
        fileHash: createHash('sha256').update(buffer).digest('hex'),
        storagePath: `dry-run/${basename(path)}`,
      },
      parsed,
    );

    console.log(`\n=== ${basename(path)}`);
    if (report.status !== 'IMPORTED') {
      console.log('  Kết quả:', report.status);
      continue;
    }
    console.log('  Dòng đọc được     :', report.rowsParsed);
    console.log('  Dòng lỗi          :', report.failedRows.length);
    console.log('  Room              :', report.rooms.length);
    console.log('  Snapshot tạo mới  :', report.snapshotsCreated);
    console.log('  Snapshot bỏ vì trùng:', report.skippedSnapshots.length);
    console.log('  Ca hệ thống tự phát hiện:', report.attribution?.discovered.length ?? 0);
  }

  const total = repo.attributions
    .filter((row) => row.isCurrent)
    .reduce((sum, row) => sum.plus(row.metrics.gmv ?? 0), new Decimal(0));

  console.log('\n=== Kết quả tách ca');
  for (const session of repo.sessions) {
    const rows = repo.currentFor(session.id);
    const gmv = rows.some((row) => row.metrics.gmv === null)
      ? null
      : rows.reduce((sum, row) => sum.plus(row.metrics.gmv!), new Decimal(0));
    const minutes = rows.reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0);

    console.log(
      `  ${session.ownership.padEnd(13)} ${formatter.format(session.startAt)} → ` +
        `${formatter.format(session.endAt)}  ${money(gmv).padStart(20)}  ` +
        `${minutes.toFixed(0)} phút  [${rows.map((row) => row.method).join(', ')}]`,
    );
  }

  console.log('\n  Tổng GMV đã quy kết:', total.toFixed(2), '₫');
  console.log('  Tổng số ca         :', repo.sessions.length);
  console.log(
    '  Ca chờ Operation   :',
    repo.sessions.filter((session) => session.ownership === 'UNKNOWN').length,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
