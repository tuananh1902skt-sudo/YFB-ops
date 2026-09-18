import type {
  AttributionDraft,
  AttributionMethod,
  DataConfidence,
  SessionOwnership,
} from '../attribution/types';
import { NOT_AVAILABLE, formatDuration, formatMoney, formatTime, formatTimeRange } from '../format';
import type { LiveImportReport } from './live-import';
import type { RecomputeResult } from './recompute';
import type { SnapshotRecord } from './types';

export type NoticeLevel = 'INFO' | 'ATTENTION' | 'BLOCKING';

export interface Notice {
  level: NoticeLevel;
  message: string;
  /** What the person can do about it, in their own words. */
  action?: string;
}

/** One line of the subtraction the screen always shows (docs/06 §2.2). */
export interface CalculationStep {
  operation: 'BASE' | 'SUBTRACT' | 'ADD';
  label: string;
  amount: string;
}

export interface SessionPreview {
  sessionId: string;
  title: string;
  ownership: SessionOwnership;
  isNewlyDiscovered: boolean;
  method: AttributionMethod;
  methodLabel: string;
  confidence: DataConfidence;
  confidenceLabel: string | null;
  gmvDisplay: string;
  ordersDisplay: string;
  durationDisplay: string;
  calculation: CalculationStep[];
  notices: Notice[];
}

export interface UploadPreview {
  status: 'READY' | 'DUPLICATE_FILE' | 'NEEDS_MAPPING' | 'NO_NEW_DATA';
  fileName: string;
  headline: string;
  rowsParsed: number;
  roomsMatched: number;
  snapshotsCreated: number;
  snapshotsSkipped: number;
  sessions: SessionPreview[];
  notices: Notice[];
  failedRows: { rowIndex: number; reason: string }[];
  /** False whenever a person has to decide something first. */
  canConfirm: boolean;
}

const METHOD_LABELS: Record<AttributionMethod, string> = {
  FULL_SNAPSHOT: 'Đoạn đầu của phòng live',
  SNAPSHOT_DELTA: 'Trừ snapshot của ca trước',
  ROOM_SUM: 'Cộng nhiều đoạn phòng live',
  MANUAL: 'Operation nhập tay',
  SHARED_UNALLOCATED: 'Chưa quy kết được',
};

const CONFIDENCE_LABELS: Record<DataConfidence, string | null> = {
  // A reliable figure carries no badge, so the badges that do appear mean something.
  HIGH: null,
  MEDIUM: 'Xấp xỉ',
  LOW: 'Chưa quy kết',
  NEEDS_REVIEW: 'Cần rà soát',
};

const ISSUE_NOTICES: Record<string, Notice> = {
  NEGATIVE_DELTA: {
    level: 'BLOCKING',
    message: 'Số của file này nhỏ hơn lần nộp trước của cùng phòng live.',
    action: 'Thường là do tải nhầm file hoặc gắn nhầm ca. Kiểm tra lại file, hoặc báo Operation.',
  },
  DUPLICATE_SNAPSHOT_TIME: {
    level: 'ATTENTION',
    message: 'Có hai lần nộp trùng đúng mốc thời gian cho cùng một phòng live.',
    action: 'Operation sẽ đối chiếu lại.',
  },
  SNAPSHOT_BEFORE_ROOM_START: {
    level: 'BLOCKING',
    message: 'Thời điểm kết thúc trong file sớm hơn lúc phòng live bắt đầu.',
    action: 'File có thể bị lỗi khi tải. Thử tải lại từ TikTok Shop.',
  },
  CONTINUITY_GAP_EXCEEDED: {
    level: 'ATTENTION',
    message: 'Phòng live kéo dài quá lâu giữa hai lần nộp, hệ thống không tự coi là một ca liền mạch.',
    action: 'Operation sẽ xác nhận đoạn này thuộc ca nào.',
  },
};

function snapshotIndex(snapshots: SnapshotRecord[]): Map<string, SnapshotRecord> {
  return new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
}

/**
 * The subtraction, spelled out. Showing only the result is how a team stops
 * trusting the system and goes back to typing numbers into a spreadsheet
 * (docs/06 §2.2), so the figures it came from are always on screen.
 */
function buildCalculation(
  draft: AttributionDraft,
  snapshots: Map<string, SnapshotRecord>,
): CalculationStep[] {
  const source = draft.sourceSnapshotId ? snapshots.get(draft.sourceSnapshotId) : undefined;
  const previous = draft.prevSnapshotId ? snapshots.get(draft.prevSnapshotId) : undefined;
  if (!source) return [];

  const steps: CalculationStep[] = [
    {
      operation: 'BASE',
      label: `Số cộng dồn lúc ${formatTime(source.snapshotEndAt)}`,
      amount: formatMoney(source.metrics.gmv),
    },
  ];

  if (previous) {
    steps.push({
      operation: 'SUBTRACT',
      label: `Trừ số cộng dồn lúc ${formatTime(previous.snapshotEndAt)}`,
      amount: formatMoney(previous.metrics.gmv),
    });
  }

  return steps;
}

/**
 * Phép tính của cả ca, khi ca trải trên nhiều đoạn phòng live (ca bị restart).
 *
 * Từ đoạn thứ hai trở đi phải hiện rõ là **cộng**. Liệt kê hai con số cạnh nhau
 * mà không có dấu phép tính thì người đọc phải tự đoán — trên đúng màn hình mà
 * mục đích là cho thấy phép tính, đó là chỗ bỏ sót tệ nhất.
 */
function buildSessionCalculation(
  drafts: AttributionDraft[],
  snapshots: Map<string, SnapshotRecord>,
): CalculationStep[] {
  return drafts.flatMap((draft, index) => {
    const steps = buildCalculation(draft, snapshots);
    if (index === 0 || steps.length === 0 || steps[0].operation !== 'BASE') return steps;

    const [first, ...rest] = steps;
    return [
      { ...first, operation: 'ADD' as const, label: first.label.replace(/^Số/, 'Cộng số') },
      ...rest,
    ];
  });
}

export function buildUploadPreview(report: LiveImportReport, fileName: string): UploadPreview {
  if (report.status === 'DUPLICATE_FILE') {
    return {
      status: 'DUPLICATE_FILE',
      fileName,
      headline: 'File này đã được nộp rồi',
      rowsParsed: 0,
      roomsMatched: 0,
      snapshotsCreated: 0,
      snapshotsSkipped: 0,
      sessions: [],
      notices: [
        {
          level: 'INFO',
          message: `Đã nộp trước đó với tên "${report.existingImport.fileName}". Số liệu đã được ghi nhận, không cần nộp lại.`,
          action: 'Nếu bạn vừa tải file mới từ TikTok Shop, hãy kiểm tra lại đúng file vừa tải.',
        },
      ],
      failedRows: [],
      canConfirm: false,
    };
  }

  if (report.status === 'NEEDS_MAPPING') {
    return {
      status: 'NEEDS_MAPPING',
      fileName,
      headline: 'Cấu trúc file không như hệ thống đang biết',
      rowsParsed: 0,
      roomsMatched: 0,
      snapshotsCreated: 0,
      snapshotsSkipped: 0,
      sessions: [],
      notices: [
        {
          level: 'BLOCKING',
          message:
            report.missingColumns.length > 0
              ? `Thiếu cột: ${report.missingColumns.join(', ')}.`
              : `Có cột lạ: ${report.unexpectedColumns.join(', ')}.`,
          action:
            'TikTok có thể vừa đổi định dạng export. Gửi file này cho Operation để khai báo lại cột, đừng sửa file bằng tay.',
        },
      ],
      failedRows: [],
      canConfirm: false,
    };
  }

  const attribution: RecomputeResult | null = report.attribution;
  const snapshots = snapshotIndex(attribution?.snapshots ?? []);
  const windows = new Map(
    (attribution?.sessionWindows ?? []).map((session) => [session.id, session]),
  );
  const discovered = new Set((attribution?.discovered ?? []).map((item) => item.sessionId));

  const sessions: SessionPreview[] = (attribution?.sessions ?? []).map((outcome) => {
    const window = windows.get(outcome.sessionId);
    const drafts = outcome.drafts;
    const notices: Notice[] = [];

    for (const issue of new Set(drafts.flatMap((draft) => draft.issues))) {
      const notice = ISSUE_NOTICES[issue];
      if (notice) notices.push(notice);
    }
    if (outcome.rejected.length > 0) notices.push(ISSUE_NOTICES.NEGATIVE_DELTA);
    if (drafts.some((draft) => draft.method === 'SHARED_UNALLOCATED')) {
      notices.push({
        level: 'BLOCKING',
        message:
          'Thiếu lần nộp ở ranh giới bàn giao, nên đoạn này đang tính chung cho nhiều ca.',
        action:
          'Hệ thống không chia đôi doanh thu. Operation sẽ quyết định cách tách, hoặc ca trước bổ sung file còn thiếu.',
      });
    }
    if (discovered.has(outcome.sessionId)) {
      notices.push({
        level: 'ATTENTION',
        message: 'Đoạn live này không khớp ca nào đã book.',
        action:
          'Hệ thống tạo một ca chờ xác nhận và chuyển cho Operation — có thể là brand tự live, hoặc ca thiếu booking.',
      });
    }

    const gmv = drafts.reduce<string | null>((total, draft) => {
      if (total === null || draft.metrics.gmv === null) return null;
      return draft.metrics.gmv.plus(total).toString();
    }, '0');
    const orders = drafts.reduce<number | null>((total, draft) => {
      if (total === null || draft.metrics.orders === null) return null;
      return total + draft.metrics.orders;
    }, 0);
    const minutes = drafts.reduce<number | null>((total, draft) => {
      if (total === null || draft.durationMinutes === null) return null;
      return total + draft.durationMinutes;
    }, 0);

    // No usable stretch at all is a different thing from a stretch shared
    // between shifts, and must not borrow its wording: nothing here is "gộp
    // chung", the figures simply could not be worked out.
    const nothingUsable = drafts.length === 0;
    const method = drafts[0]?.method ?? 'SHARED_UNALLOCATED';
    const confidence = drafts[0]?.confidence ?? 'NEEDS_REVIEW';

    return {
      sessionId: outcome.sessionId,
      title: window ? formatTimeRange(window.startAt, window.endAt) : 'Ca chưa xác định',
      ownership: window?.ownership ?? 'UNKNOWN',
      isNewlyDiscovered: discovered.has(outcome.sessionId),
      method,
      methodLabel: nothingUsable ? 'Chưa tính được từ file này' : METHOD_LABELS[method],
      confidence,
      confidenceLabel: CONFIDENCE_LABELS[confidence],
      gmvDisplay: nothingUsable
        ? 'Chưa tính được'
        : method === 'SHARED_UNALLOCATED'
          ? 'Gộp chung'
          : formatMoney(gmv),
      ordersDisplay: nothingUsable || orders === null ? NOT_AVAILABLE : String(orders),
      durationDisplay: formatDuration(nothingUsable ? null : minutes),
      calculation: buildSessionCalculation(drafts, snapshots),
      notices,
    };
  });

  const notices: Notice[] = [];
  if (report.snapshotsCreated === 0) {
    notices.push({
      level: 'INFO',
      message: 'Không có số liệu mới trong file này — các mốc thời gian đã được nộp trước đó.',
      action: 'Không cần làm gì thêm.',
    });
  }
  if (report.skippedSnapshots.length > 0 && report.snapshotsCreated > 0) {
    notices.push({
      level: 'INFO',
      message: `${report.skippedSnapshots.length} dòng đã có trong hệ thống nên được bỏ qua, không cộng dồn hai lần.`,
    });
  }
  if (report.failedRows.length > 0) {
    notices.push({
      level: 'ATTENTION',
      message: `${report.failedRows.length} dòng trong file không đọc được.`,
      action: 'Các dòng còn lại vẫn nộp được. Operation sẽ xem lại dòng lỗi.',
    });
  }

  const blocked = sessions.some((session) =>
    session.notices.some((notice) => notice.level === 'BLOCKING'),
  );

  return {
    status: report.snapshotsCreated === 0 ? 'NO_NEW_DATA' : 'READY',
    fileName,
    headline:
      report.snapshotsCreated === 0
        ? 'Không có số liệu mới'
        : `Đã đọc được file · ${report.rooms.length} phòng live`,
    rowsParsed: report.rowsParsed,
    roomsMatched: report.rooms.length,
    snapshotsCreated: report.snapshotsCreated,
    snapshotsSkipped: report.skippedSnapshots.length,
    sessions,
    notices,
    failedRows: report.failedRows,
    canConfirm: report.snapshotsCreated > 0 && !blocked,
  };
}
