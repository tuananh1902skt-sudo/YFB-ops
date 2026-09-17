import { Decimal } from 'decimal.js';
import type { CumulativeMetrics, LiveParseResult, LiveSnapshotRow } from '../parsing/live-performance';
import { importLivePerformance } from './live-import';
import { MemoryRepository } from './memory-repository';
import { previewLiveImport } from './preview';
import { buildUploadPreview, type UploadPreview } from './upload-preview';

/**
 * Runs the real engine over made-up shifts so the upload screen can be reviewed
 * before the pilot brand's data exists. The numbers below are examples; the
 * split shown on screen is computed, not written by hand.
 */
const ROOM = '7683365340126808852';

function metrics(gmv: string, orders: number): CumulativeMetrics {
  return {
    gmv: new Decimal(gmv),
    itemsSold: orders,
    orders,
    skuOrders: orders,
    customers: orders,
    views: orders * 400,
    impressions: orders * 600,
    productImpressions: orders * 900,
    productClicks: orders * 120,
    newFollowers: orders * 2,
    comments: orders * 5,
    shares: orders,
    likes: orders * 30,
  };
}

function row(rowIndex: number, start: string, end: string, gmv: string, orders: number): LiveSnapshotRow {
  return {
    rowIndex,
    rawValues: {},
    platformRoomId: ROOM,
    roomTitle: 'FRANKLIN IS BACK! SPECIAL LIVE',
    roomStartAt: new Date(`${start}+07:00`),
    snapshotEndAt: new Date(`${end}+07:00`),
    durationMinutes: null,
    metrics: metrics(gmv, orders),
    reportedDerived: {},
  };
}

function parsed(rows: LiveSnapshotRow[]): LiveParseResult {
  return {
    status: 'PARSED',
    headerSignature: 'demo',
    dataPeriod: { start: '2026-09-09', end: '2026-09-09' },
    rows,
    failedRows: [],
  };
}

function context(fileHash: string) {
  return {
    platformAccountId: 'demo-account',
    uploadedBy: 'demo-user',
    fileName: 'Creator-Live-Performance_20260909160312.xlsx',
    fileHash,
    storagePath: `demo/${fileHash}.xlsx`,
  };
}

function shifts(repo: MemoryRepository) {
  repo.addSession({
    id: 'demo-morning',
    brandId: 'demo-brand',
    startAt: new Date('2026-09-09 10:00:00+07:00'),
    endAt: new Date('2026-09-09 13:00:00+07:00'),
  });
  repo.addSession({
    id: 'demo-afternoon',
    brandId: 'demo-brand',
    startAt: new Date('2026-09-09 13:00:00+07:00'),
    endAt: new Date('2026-09-09 16:00:00+07:00'),
  });
}

const MORNING = row(4, '2026-09-09 10:01:57', '2026-09-09 13:00:00', '30000000', 30);
const AFTERNOON = row(5, '2026-09-09 10:01:57', '2026-09-09 16:02:48', '77025508.90', 82);

export interface DemoScenario {
  id: string;
  title: string;
  situation: string;
  preview: UploadPreview;
}

export async function buildDemoScenarios(): Promise<DemoScenario[]> {
  const handover = new MemoryRepository('a:');
  shifts(handover);
  await importLivePerformance(handover, context('a'.repeat(64)), parsed([MORNING]));

  const missingBoundary = new MemoryRepository('b:');
  shifts(missingBoundary);

  const wrongOrder = new MemoryRepository('c:');
  shifts(wrongOrder);

  const unbooked = new MemoryRepository('d:');

  const [normal, shared, negative, unknown] = await Promise.all([
    previewLiveImport(handover, context('1'.repeat(64)), parsed([MORNING, AFTERNOON])),
    previewLiveImport(missingBoundary, context('2'.repeat(64)), parsed([AFTERNOON])),
    previewLiveImport(
      wrongOrder,
      context('3'.repeat(64)),
      parsed([MORNING, { ...AFTERNOON, metrics: metrics('20000000', 20) }]),
    ),
    previewLiveImport(unbooked, context('4'.repeat(64)), parsed([MORNING])),
  ]);

  return [
    {
      id: 'handover',
      title: 'Ca nối — bàn giao không tắt sóng',
      situation:
        'Ca sáng đã nộp lúc 13:00. Trợ live ca chiều nộp file cuối ca. Hệ thống trừ hai số cộng dồn.',
      preview: buildUploadPreview(normal, context('1'.repeat(64)).fileName),
    },
    {
      id: 'shared',
      title: 'Ca trước quên nộp file',
      situation:
        'Chỉ có số cuối ngày. Doanh thu của cả hai ca nằm chung trong một đoạn, không tách được.',
      preview: buildUploadPreview(shared, context('2'.repeat(64)).fileName),
    },
    {
      id: 'negative',
      title: 'File sai — số cộng dồn giảm',
      situation: 'Nhiều khả năng tải nhầm file hoặc gắn nhầm ca. Hệ thống dừng lại, không tự sửa.',
      preview: buildUploadPreview(negative, context('3'.repeat(64)).fileName),
    },
    {
      id: 'unknown',
      title: 'Đoạn live không khớp ca nào đã book',
      situation: 'Có thể là brand tự live. Hệ thống tạo ca chờ Operation xác nhận, không đoán.',
      preview: buildUploadPreview(unknown, context('4'.repeat(64)).fileName),
    },
  ];
}
