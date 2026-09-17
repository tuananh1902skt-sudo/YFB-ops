import { Decimal } from 'decimal.js';
import type { CumulativeMetrics, LiveParseResult, LiveSnapshotRow } from '../parsing/live-performance';
import { importLivePerformance } from './live-import';
import { MemoryRepository } from './memory-repository';
import { previewLiveImport } from './preview';
import { buildUploadPreview, type UploadPreview } from './upload-preview';
import { sumUnallocated } from '../operations/unallocated';
import { toPlatformDateString } from '../parsing/primitives';
import type { QueueCount, UnknownStretch } from '../operations/types';
import type { DetailAttribution, DetailSnapshot, SessionDetail } from '../sessions/detail-types';

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

/**
 * The same made-up shifts, seen from Operation's side. The stretches and the
 * unattributed total come out of the engine; the counts that need a schedule
 * (overdue uploads, unstaffed shifts) are illustrative until real bookings exist.
 */
export async function buildOperationsDemo() {
  const store = new MemoryRepository('ops:');
  shifts(store);

  // A shift whose boundary upload never arrived.
  await importLivePerformance(store, context('5'.repeat(64)), parsed([AFTERNOON]));
  // A stretch nobody booked — the brand streaming on their own.
  await importLivePerformance(
    store,
    context('6'.repeat(64)),
    parsed([row(4, '2026-09-11 09:00:00', '2026-09-11 11:00:00', '4200000', 7)]),
  );

  const unknownSessions = store.sessions.filter((session) => session.ownership === 'UNKNOWN');
  const sharedRows = store.attributions.filter(
    (attribution) => attribution.isCurrent && attribution.method === 'SHARED_UNALLOCATED',
  );
  const shared = sumUnallocated(
    sharedRows.map((attribution) => {
      const source = store.snapshots.find((item) => item.id === attribution.sourceSnapshotId);
      const previous = store.snapshots.find((item) => item.id === attribution.prevSnapshotId);
      return {
        sourceSnapshotId: attribution.sourceSnapshotId,
        prevSnapshotId: attribution.prevSnapshotId,
        sourceGmv: source?.metrics.gmv?.toString() ?? null,
        prevGmv: previous?.metrics.gmv?.toString() ?? null,
      };
    }),
  );

  const counts: QueueCount[] = [
    { key: 'DATA_OVERDUE', count: 2, amount: null },
    { key: 'NEEDS_REVIEW', count: 1, amount: null },
    { key: 'OWNERSHIP_UNKNOWN', count: unknownSessions.length, amount: null },
    { key: 'UNALLOCATED_GMV', count: shared.count, amount: shared.amount },
    { key: 'EVENTS_PENDING_REVIEW', count: 5, amount: null },
    { key: 'UNSTAFFED_SESSIONS', count: 2, amount: null },
  ];

  const stretches: UnknownStretch[] = unknownSessions.map((session) => {
    const rows = store.currentFor(session.id);
    return {
      sessionId: session.id,
      brandId: session.brandId,
      brandName: 'Franklin',
      platformAccountId: session.platformAccountId,
      sessionDate: toPlatformDateString(session.startAt),
      startAt: session.startAt,
      endAt: session.endAt,
      roomIds: rows.map((item) => item.roomId),
      platformRoomIds: [ROOM],
      gmv: rows.some((item) => item.metrics.gmv === null)
        ? null
        : rows.reduce((total, item) => total.plus(item.metrics.gmv!), new Decimal(0)),
      orders: rows.some((item) => item.metrics.orders === null)
        ? null
        : rows.reduce((total, item) => total + item.metrics.orders!, 0),
      nearbySessions: [
        {
          sessionId: 'demo-morning',
          startAt: new Date('2026-09-11 10:00:00+07:00'),
          endAt: new Date('2026-09-11 13:00:00+07:00'),
          ownership: 'AGENCY',
          status: 'DATA_COMPLETE',
          hostNames: ['Khói'],
        },
      ],
    };
  });

  return { counts, stretches };
}

/**
 * A handed-over shift, seen from the detail screen. The split, the arithmetic
 * and the superseded row all come from the engine; only the names are invented.
 */
export async function buildSessionDetailDemo(): Promise<SessionDetail> {
  const store = new MemoryRepository('detail:');
  shifts(store);

  // First the morning shift's own upload, then the afternoon one — which is
  // what turns the afternoon figure into a subtraction.
  await importLivePerformance(store, context('7'.repeat(64)), parsed([MORNING]));
  await importLivePerformance(store, context('8'.repeat(64)), parsed([MORNING, AFTERNOON]));

  const sessionId = 'demo-afternoon';
  const snapshotOf = (id: string | null) => store.snapshots.find((item) => item.id === id) ?? null;
  const importFileFor = (snapshotId: string | null) => {
    const snapshot = snapshotOf(snapshotId);
    if (!snapshot) return null;
    const rawRow = store.rawRows.find((row) => row.id === store.snapshots.indexOf(snapshot).toString());
    const file = store.imports.find((item) => item.id === rawRow?.importId);
    return file?.context.fileName ?? 'Creator-Live-Performance.xlsx';
  };

  const toSnapshot = (id: string | null): DetailSnapshot | null => {
    const snapshot = snapshotOf(id);
    if (!snapshot) return null;
    return {
      snapshotId: snapshot.id,
      endAt: snapshot.snapshotEndAt.toISOString(),
      gmv: snapshot.metrics.gmv?.toString() ?? null,
      orders: snapshot.metrics.orders,
      importId: 'demo-import',
      fileName: importFileFor(id) ?? 'Creator-Live-Performance.xlsx',
    };
  };

  const attributions: DetailAttribution[] = store.attributions
    .filter((row) => row.sessionId === sessionId)
    .map((row, index) => ({
      id: `attr-${index}`,
      method: row.method,
      confidence: row.confidence,
      platformRoomId: ROOM,
      segmentStartAt: row.segmentStartAt?.toISOString() ?? null,
      segmentEndAt: row.segmentEndAt?.toISOString() ?? null,
      durationMinutes: row.durationMinutes,
      gmv: row.metrics.gmv?.toString() ?? null,
      orders: row.metrics.orders,
      itemsSold: row.metrics.itemsSold,
      customers: row.metrics.customers,
      views: row.metrics.views,
      productImpressions: row.metrics.productImpressions,
      productClicks: row.metrics.productClicks,
      newFollowers: row.metrics.newFollowers,
      sourceSnapshot: toSnapshot(row.sourceSnapshotId),
      previousSnapshot: toSnapshot(row.prevSnapshotId),
      computedReason: row.computedReason,
      overrideReason: null,
      computedAt: new Date('2026-09-09T16:05:00+07:00').toISOString(),
      isCurrent: row.isCurrent,
    }));

  return {
    sessionId,
    brandName: 'FRANKLIN',
    sessionDate: '09/09/2026',
    status: 'DATA_COMPLETE',
    ownership: 'AGENCY',
    confidence: 'HIGH',
    plannedStartAt: '2026-09-09T13:00:00+07:00',
    plannedEndAt: '2026-09-09T16:00:00+07:00',
    actualStartAt: '2026-09-09T13:00:00+07:00',
    actualEndAt: '2026-09-09T16:02:48+07:00',
    targetGmv: '40000000',
    staff: [
      { name: 'Linh Ân', role: 'HOST', startedAt: null, endedAt: null },
      { name: 'Minh', role: 'ASSISTANT', startedAt: null, endedAt: null },
    ],
    events: [
      {
        id: 'e1',
        eventType: 'HANDOVER_AGENCY_TEAM',
        occurredAt: '2026-09-09T13:00:00+07:00',
        reason: null,
        actorName: 'Minh',
        reviewStatus: 'LOGGED',
      },
      {
        id: 'e2',
        eventType: 'SESSION_ENDED',
        occurredAt: '2026-09-09T16:02:48+07:00',
        reason: null,
        actorName: 'Minh',
        reviewStatus: 'LOGGED',
      },
    ],
    attributions,
    auditLogs: [
      {
        id: 'a1',
        action: 'OWNERSHIP_CONFIRMED',
        reason: 'Ca agency, bổ sung booking thiếu',
        actorName: 'Operation',
        createdAt: '2026-09-09T17:12:00+07:00',
      },
    ],
  };
}
