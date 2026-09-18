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
import type { DashboardSessionRow } from '../analytics/brand-dashboard';
import { buildCommandCenter } from '../command-center/build';
import type { CommandCenter } from '../command-center/types';
import { recommendTarget } from '../targets/recommend';
import { toSuggestionView, type TargetSuggestionView } from '../targets/presentation';
import type { HistoricalShift } from '../targets/types';

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

/**
 * Two weeks of shifts run through the real engine, so the dashboard's figures
 * are split the way production would split them — including a day whose
 * handover report never arrived.
 */
export interface DemoDay {
  day: string;
  morning: string;
  evening: string;
  target: string | null;
  /** Số đơn cộng dồn tới cuối ca sáng / cuối ngày. */
  morningOrders?: number;
  dayOrders?: number;
}

export interface DashboardDemoOptions {
  /** Tránh đụng id giữa các brand khi dựng nhiều brand trong cùng một tiến trình. */
  namespace?: string;
  days?: DemoDay[];
  /** Ngày thiếu report lúc bàn giao, nên cả ngày không quy kết về ca nào được. */
  missingBoundaryOn?: string | null;
  /** GMV brand tự live trong kỳ, null nghĩa là brand không tự live. */
  inhouseGmv?: string | null;
  hosts?: [string, string];
}

const DEFAULT_DEMO_DAYS: DemoDay[] = [
  { day: '2026-09-08', morning: '18500000', evening: '24200000', target: '40000000' },
  { day: '2026-09-09', morning: '30000000', evening: '47025508.90', target: '40000000' },
  { day: '2026-09-10', morning: '12400000', evening: '31800000', target: '40000000' },
  { day: '2026-09-11', morning: '9800000', evening: '16500000', target: '40000000' },
  { day: '2026-09-12', morning: '21300000', evening: '52700000', target: '45000000' },
  { day: '2026-09-13', morning: '15900000', evening: '28400000', target: '45000000' },
];

export async function buildDashboardDemo(options: DashboardDemoOptions = {}): Promise<{
  rows: DashboardSessionRow[];
  unallocatedGmv: Decimal;
}> {
  const {
    namespace = 'dash:',
    days = DEFAULT_DEMO_DAYS,
    missingBoundaryOn = '2026-09-11',
    inhouseGmv = '8600000',
    hosts = ['Khói', 'Linh Ân'],
  } = options;
  const store = new MemoryRepository(namespace);

  const rows: DashboardSessionRow[] = [];
  let snapshotIndex = 100;

  for (const [index, entry] of days.entries()) {
    const morningId = `${entry.day}-sang`;
    const eveningId = `${entry.day}-chieu`;
    const host = index % 2 === 0 ? hosts[0] : hosts[1];

    store.addSession({
      id: morningId,
      brandId: 'demo-brand',
      platformAccountId: 'demo-account',
      startAt: new Date(`${entry.day} 10:00:00+07:00`),
      endAt: new Date(`${entry.day} 13:00:00+07:00`),
    });
    store.addSession({
      id: eveningId,
      brandId: 'demo-brand',
      platformAccountId: 'demo-account',
      startAt: new Date(`${entry.day} 13:00:00+07:00`),
      endAt: new Date(`${entry.day} 16:00:00+07:00`),
    });

    const cumulative = new Decimal(entry.morning).plus(entry.evening).toString();
    // On 11/09 the assistant never uploaded at the handover, so the day's
    // figures cover both shifts and neither may claim them.
    const missingBoundary = entry.day === missingBoundaryOn;
    const morningOrders = entry.morningOrders ?? 28;
    const dayOrders = entry.dayOrders ?? 70;
    const uploads = missingBoundary
      ? [row(snapshotIndex++, `${entry.day} 10:01:00`, `${entry.day} 16:02:00`, cumulative, dayOrders)]
      : [
          row(snapshotIndex++, `${entry.day} 10:01:00`, `${entry.day} 13:00:00`, entry.morning, morningOrders),
          row(snapshotIndex++, `${entry.day} 10:01:00`, `${entry.day} 16:02:00`, cumulative, dayOrders),
        ];

    await importLivePerformance(
      store,
      context(`${namespace}${index}`.padEnd(64, '0').slice(0, 64)),
      parsed(uploads),
    );

    for (const [sessionId, targetGmv] of [
      [morningId, entry.target],
      [eveningId, entry.target],
    ] as const) {
      const attributions = store.currentFor(sessionId);
      const hasUnallocated = attributions.some((item) => item.method === 'SHARED_UNALLOCATED');
      const sum = (pick: (item: (typeof attributions)[number]) => number | null) =>
        attributions.reduce<number | null>((total, item) => {
          const value = pick(item);
          if (total === null || value === null) return null;
          return total + value;
        }, 0);

      rows.push({
        sessionId,
        sessionDate: entry.day,
        ownership: 'AGENCY',
        confidence: attributions[0]?.confidence ?? null,
        status: attributions.length === 0 ? 'DATA_PENDING' : 'DATA_COMPLETE',
        gmv: attributions.some((item) => item.metrics.gmv === null)
          ? null
          : attributions
              .reduce((total, item) => total.plus(item.metrics.gmv!), new Decimal(0))
              .toString(),
        orders: sum((item) => item.metrics.orders),
        itemsSold: sum((item) => item.metrics.itemsSold),
        customers: sum((item) => item.metrics.customers),
        views: sum((item) => item.metrics.views),
        productImpressions: sum((item) => item.metrics.productImpressions),
        productClicks: sum((item) => item.metrics.productClicks),
        liveMinutes: sum((item) => item.durationMinutes),
        targetGmv,
        hasUnallocated,
        hostNames: [host],
      });
    }
  }

  // The brand streamed on its own one evening, already confirmed by Operation.
  if (inhouseGmv !== null) rows.push({
    sessionId: `${namespace}inhouse-1`,
    sessionDate: '2026-09-12',
    ownership: 'BRAND_INHOUSE',
    confidence: 'HIGH',
    status: 'DATA_COMPLETE',
    gmv: inhouseGmv,
    orders: 11,
    itemsSold: 12,
    customers: 11,
    views: 4200,
    productImpressions: 3900,
    productClicks: 520,
    liveMinutes: 120,
    targetGmv: null,
    hasUnallocated: false,
    hostNames: [],
  });

  const shared = store.attributions.filter(
    (item) => item.isCurrent && item.method === 'SHARED_UNALLOCATED',
  );
  const unallocated = sumUnallocated(
    shared.map((item) => {
      const source = store.snapshots.find((snapshot) => snapshot.id === item.sourceSnapshotId);
      const previous = store.snapshots.find((snapshot) => snapshot.id === item.prevSnapshotId);
      return {
        sourceSnapshotId: item.sourceSnapshotId,
        prevSnapshotId: item.prevSnapshotId,
        sourceGmv: source?.metrics.gmv?.toString() ?? null,
        prevGmv: previous?.metrics.gmv?.toString() ?? null,
      };
    }),
  );

  return { rows, unallocatedGmv: unallocated.amount };
}

/**
 * Ba brand cho màn hình tổng hợp, mỗi brand có một vấn đề khác nhau: một brand
 * thiếu report lúc bàn giao, một brand hụt target, một brand sạch nhưng nhỏ.
 * Số vẫn do engine thật tách, không phải số gõ tay.
 */
export async function buildPortfolioDemo(): Promise<
  { brandId: string; brandName: string; rows: DashboardSessionRow[]; unallocatedGmv: Decimal }[]
> {
  // Số đơn co giãn cùng GMV, nếu không AOV giữa các brand sẽ lệch nhau vô lý.
  const scale = (factor: number, target: string): DemoDay[] =>
    DEFAULT_DEMO_DAYS.map((entry) => ({
      ...entry,
      morning: new Decimal(entry.morning).times(factor).toFixed(2),
      evening: new Decimal(entry.evening).times(factor).toFixed(2),
      morningOrders: Math.max(1, Math.round(28 * factor)),
      dayOrders: Math.max(2, Math.round(70 * factor)),
      target,
    }));

  // Ba trạng thái khác nhau: vượt target, sát target nhưng có tiền treo, hụt target.
  const franklin = await buildDashboardDemo({ days: scale(1, '30000000') });

  const beHive = await buildDashboardDemo({
    namespace: 'demo-b:',
    days: scale(0.55, '12000000'),
    missingBoundaryOn: null,
    inhouseGmv: null,
    hosts: ['Mai', 'Thu Hà'],
  });

  const nauMoc = await buildDashboardDemo({
    namespace: 'demo-c:',
    days: scale(0.28, '9000000'),
    missingBoundaryOn: null,
    inhouseGmv: '4100000',
    hosts: ['Quỳnh', 'Bảo'],
  });

  return [
    { brandId: 'franklin', brandName: 'Franklin', ...franklin },
    { brandId: 'be-hive', brandName: 'Be Hive', ...beHive },
    { brandId: 'nau-moc', brandName: 'Nâu Mộc', ...nauMoc },
  ].map((brand) => ({
    brandId: brand.brandId,
    brandName: brand.brandName,
    rows: brand.rows,
    unallocatedGmv: brand.unallocatedGmv,
  }));
}

/**
 * Một ngày vận hành thật: ca sáng đã xong, ca chiều đang live, ca tối chưa có
 * người, cộng vài việc đang kẹt. Số của ca đã xong do engine thật tách.
 */
export async function buildCommandCenterDemo(): Promise<CommandCenter> {
  const now = new Date('2026-09-18T15:30:00+07:00');
  const day = '2026-09-18';
  const at = (time: string) => new Date(`${day} ${time}:00+07:00`);

  return buildCommandCenter({
    today: day,
    now,
    sessions: [
      {
        sessionId: 'demo-sang',
        brandName: 'Franklin',
        startAt: at('10:00'),
        endAt: at('13:00'),
        staffNames: ['Khói', 'Linh Ân'],
        status: 'DATA_COMPLETE',
        ownership: 'AGENCY',
        gmv: '31800000',
        targetGmv: '30000000',
      },
      {
        sessionId: 'demo-chieu',
        brandName: 'Franklin',
        startAt: at('14:00'),
        endAt: at('17:00'),
        staffNames: ['Mai'],
        status: 'LIVE',
        ownership: 'AGENCY',
        gmv: '18200000',
        targetGmv: '30000000',
      },
      {
        sessionId: 'demo-toi',
        brandName: 'Be Hive',
        startAt: at('19:00'),
        endAt: at('23:00'),
        staffNames: [],
        status: 'CONFIRMED',
        ownership: 'AGENCY',
        gmv: null,
        targetGmv: '45000000',
      },
      {
        sessionId: 'demo-inhouse',
        brandName: 'Franklin',
        startAt: at('08:00'),
        endAt: at('09:30'),
        staffNames: [],
        status: 'DATA_COMPLETE',
        ownership: 'BRAND_INHOUSE',
        gmv: '4100000',
        targetGmv: null,
      },
    ],
    counts: {
      unknownOwnership: 2,
      awaitingData: 3,
      pendingBookings: 1,
      unstaffedSlots: 2,
    },
    unallocatedGmv: new Decimal('26300000'),
  });
}

/**
 * Ba trạng thái của Target Engine, tính bằng chính engine thật: đủ dữ liệu, thiếu
 * dữ liệu, và không đủ để đề xuất. Trạng thái thứ ba quan trọng không kém hai cái
 * đầu — nó là lúc hệ thống từ chối bịa một con số.
 */
export function buildTargetDemo(): { title: string; note: string; view: TargetSuggestionView }[] {
  const today = '2026-09-18';
  const dayBefore = (daysAgo: number) => {
    const value = new Date(`${today}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() - daysAgo);
    return value.toISOString().slice(0, 10);
  };

  const history: HistoricalShift[] = [];
  // 24 ca thường trong 80 ngày, GMV dao động quanh 9–13tr/giờ.
  for (let index = 0; index < 24; index += 1) {
    const swing = [9_000_000, 11_500_000, 13_000_000, 10_200_000][index % 4];
    history.push({
      sessionId: `daily-${index}`,
      sessionDate: dayBefore(index * 3 + 1),
      campaignTypeCode: 'DAILY',
      hostNames: [index % 3 === 0 ? 'Linh Ân' : 'Khói'],
      gmv: new Decimal(swing).times(3).toFixed(0),
      liveMinutes: 180,
    });
  }
  // 4 ca payday, hiệu quả cao hơn hẳn.
  for (let index = 0; index < 4; index += 1) {
    history.push({
      sessionId: `payday-${index}`,
      sessionDate: dayBefore(index * 15 + 5),
      campaignTypeCode: 'PAYDAY',
      hostNames: ['Linh Ân'],
      gmv: new Decimal(24_000_000).times(4).toFixed(0),
      liveMinutes: 240,
    });
  }

  return [
    {
      title: 'Ca payday, host Linh Ân',
      note: 'Đủ lịch sử, có cả hệ số campaign lẫn hệ số host.',
      view: toSuggestionView(
        recommendTarget(
          history,
          { plannedHours: 4, campaignTypeCode: 'PAYDAY', hostNames: ['Linh Ân'] },
          today,
        ),
      ),
    },
    {
      title: 'Ca thường 3 tiếng',
      note: 'Chỉ có baseline và xu hướng — không có hệ số nào khác áp dụng được.',
      view: toSuggestionView(
        recommendTarget(history, { plannedHours: 3, campaignTypeCode: null, hostNames: [] }, today),
      ),
    },
    {
      title: 'Brand mới, 4 ca',
      note: 'Hệ thống từ chối đề xuất thay vì đưa ra một con số trông hợp lý.',
      view: toSuggestionView(
        recommendTarget(
          history.slice(0, 4),
          { plannedHours: 3, campaignTypeCode: null, hostNames: [] },
          today,
        ),
      ),
    },
  ];
}
