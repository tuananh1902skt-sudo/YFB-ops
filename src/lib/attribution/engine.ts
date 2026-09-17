import { Decimal } from 'decimal.js';
import { COUNT_FIELDS, type CumulativeMetrics } from '../parsing/live-performance';
import type {
  AttributionDraft,
  DataConfidence,
  RoomInput,
  RoomSegment,
  SegmentAssignment,
  SegmentIssue,
  SessionResult,
  SessionWindow,
} from './types';

/**
 * A booked shift and a room segment rarely line up to the second, so a sliver of
 * overlap is not evidence the shift produced that stretch.
 */
export const MIN_OVERLAP_MINUTES = 2;
export const MIN_OVERLAP_RATIO = 0.1;
/**
 * A room the platform keeps open across a gap this long is not evidence the
 * stream ran the whole time (docs/01 §6.6). Overridable per environment through
 * the `room_continuity_max_gap_hours` system setting.
 */
export const MAX_CONTINUITY_GAP_MINUTES = 8 * 60;

export interface SegmentOptions {
  maxContinuityGapMinutes?: number;
}

export interface MatchOptions {
  minOverlapMinutes?: number;
  minOverlapRatio?: number;
}

const MS_PER_MINUTE = 60_000;

function emptyMetrics(): CumulativeMetrics {
  return {
    gmv: null,
    itemsSold: null,
    orders: null,
    skuOrders: null,
    customers: null,
    views: null,
    impressions: null,
    productImpressions: null,
    productClicks: null,
    newFollowers: null,
    comments: null,
    shares: null,
    likes: null,
  };
}

function minutesBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_MINUTE;
}

/**
 * Running totals only ever grow within a room, so a drop means the snapshots are
 * out of order or tagged to the wrong shift. Such a segment yields no figures.
 */
function subtractMetrics(
  current: CumulativeMetrics,
  previous: CumulativeMetrics,
): { metrics: CumulativeMetrics; negative: boolean } {
  const metrics = emptyMetrics();
  let negative = false;

  if (current.gmv !== null && previous.gmv !== null) {
    const delta = current.gmv.minus(previous.gmv);
    if (delta.isNegative()) negative = true;
    metrics.gmv = delta;
  }

  for (const field of COUNT_FIELDS) {
    const currentValue = current[field];
    const previousValue = previous[field];
    if (currentValue === null || previousValue === null) continue;

    const delta = currentValue - previousValue;
    if (delta < 0) negative = true;
    metrics[field] = delta;
  }

  return { metrics, negative };
}

export function computeRoomSegments(room: RoomInput, options: SegmentOptions = {}): RoomSegment[] {
  const maxGapMinutes = options.maxContinuityGapMinutes ?? MAX_CONTINUITY_GAP_MINUTES;
  const ordered = [...room.snapshots].sort((a, b) => a.endAt.getTime() - b.endAt.getTime());
  const segments: RoomSegment[] = [];

  ordered.forEach((snapshot, index) => {
    const previous = index === 0 ? null : ordered[index - 1];
    const startAt = previous ? previous.endAt : room.startAt;
    const issues: SegmentIssue[] = [];

    if (snapshot.endAt.getTime() < room.startAt.getTime()) {
      issues.push('SNAPSHOT_BEFORE_ROOM_START');
    }
    if (previous && previous.endAt.getTime() === snapshot.endAt.getTime()) {
      issues.push('DUPLICATE_SNAPSHOT_TIME');
    }

    const durationMinutes = Math.max(0, minutesBetween(startAt, snapshot.endAt));
    if (durationMinutes > maxGapMinutes) {
      issues.push('CONTINUITY_GAP_EXCEEDED');
    }

    let metrics: CumulativeMetrics;
    if (previous) {
      const result = subtractMetrics(snapshot.metrics, previous.metrics);
      if (result.negative) {
        issues.push('NEGATIVE_DELTA');
        metrics = emptyMetrics();
      } else {
        metrics = result.metrics;
      }
    } else {
      metrics = { ...snapshot.metrics };
    }

    segments.push({
      roomId: room.roomId,
      sourceSnapshotId: snapshot.snapshotId,
      prevSnapshotId: previous?.snapshotId ?? null,
      startAt,
      endAt: snapshot.endAt,
      durationMinutes,
      method: previous ? 'SNAPSHOT_DELTA' : 'FULL_SNAPSHOT',
      metrics,
      issues,
    });
  });

  return segments;
}

function overlapMinutes(segment: RoomSegment, session: SessionWindow): number {
  const start = Math.max(segment.startAt.getTime(), session.startAt.getTime());
  const end = Math.min(segment.endAt.getTime(), session.endAt.getTime());
  return Math.max(0, (end - start) / MS_PER_MINUTE);
}

export function assignSegments(
  segments: RoomSegment[],
  sessions: SessionWindow[],
  options: MatchOptions = {},
): SegmentAssignment[] {
  const minMinutes = options.minOverlapMinutes ?? MIN_OVERLAP_MINUTES;
  const minRatio = options.minOverlapRatio ?? MIN_OVERLAP_RATIO;

  return segments.map((segment) => {
    const threshold = Math.max(minMinutes, segment.durationMinutes * minRatio);
    const matches = sessions.filter((session) => overlapMinutes(segment, session) >= threshold);

    if (matches.length === 1) {
      return { kind: 'ATTRIBUTED', sessionId: matches[0].sessionId, segment };
    }
    if (matches.length > 1) {
      return { kind: 'SHARED_UNALLOCATED', sessionIds: matches.map((s) => s.sessionId), segment };
    }
    return { kind: 'UNMATCHED', segment };
  });
}

function sumMetrics(segments: RoomSegment[]): CumulativeMetrics {
  const total = emptyMetrics();

  const gmvValues = segments.map((segment) => segment.metrics.gmv);
  if (!gmvValues.some((value) => value === null)) {
    total.gmv = gmvValues.reduce<Decimal>((sum, value) => sum.plus(value!), new Decimal(0));
  }

  for (const field of COUNT_FIELDS) {
    const values = segments.map((segment) => segment.metrics[field]);
    if (values.some((value) => value === null)) continue;
    total[field] = values.reduce<number>((sum, value) => sum + value!, 0);
  }

  return total;
}

export function computeSessionResult(
  sessionId: string,
  assignments: SegmentAssignment[],
): SessionResult {
  const owned = assignments.filter(
    (assignment): assignment is Extract<SegmentAssignment, { kind: 'ATTRIBUTED' }> =>
      assignment.kind === 'ATTRIBUTED' && assignment.sessionId === sessionId,
  );
  const shared = assignments.filter(
    (assignment): assignment is Extract<SegmentAssignment, { kind: 'SHARED_UNALLOCATED' }> =>
      assignment.kind === 'SHARED_UNALLOCATED' && assignment.sessionIds.includes(sessionId),
  );

  const segments = owned.map((assignment) => assignment.segment);
  const issues = [...segments, ...shared.map((s) => s.segment)].flatMap((segment) => segment.issues);
  const roomIds = [...new Set(segments.map((segment) => segment.roomId))];

  // A missing boundary snapshot leaves figures covering several shifts at once;
  // splitting them would be invention, so this shift reports no figures of its own.
  if (shared.length > 0) {
    const sharedWith = [...new Set(shared.flatMap((s) => s.sessionIds))].filter((id) => id !== sessionId);
    return {
      sessionId,
      method: 'SHARED_UNALLOCATED',
      metrics: emptyMetrics(),
      liveMinutes: null,
      confidence: 'LOW',
      roomIds: [...new Set([...roomIds, ...shared.map((s) => s.segment.roomId)])],
      sharedWithSessionIds: sharedWith,
      issues,
    };
  }

  if (segments.length === 0) {
    return {
      sessionId,
      method: 'SHARED_UNALLOCATED',
      metrics: emptyMetrics(),
      liveMinutes: null,
      confidence: 'NEEDS_REVIEW',
      roomIds: [],
      sharedWithSessionIds: [],
      issues,
    };
  }

  const method =
    segments.length > 1 ? 'ROOM_SUM' : segments[0].method;

  let confidence: SessionResult['confidence'];
  if (issues.length > 0) {
    confidence = 'NEEDS_REVIEW';
  } else if (roomIds.length > 1) {
    confidence = 'MEDIUM';
  } else {
    confidence = 'HIGH';
  }

  return {
    sessionId,
    method,
    metrics: sumMetrics(segments),
    liveMinutes: segments.reduce((sum, segment) => sum + segment.durationMinutes, 0),
    confidence,
    roomIds,
    sharedWithSessionIds: [],
    issues,
  };
}

function groupByRoom(segments: RoomSegment[]): Map<string, RoomSegment[]> {
  const grouped = new Map<string, RoomSegment[]>();
  for (const segment of segments) {
    const bucket = grouped.get(segment.roomId);
    if (bucket) bucket.push(segment);
    else grouped.set(segment.roomId, [segment]);
  }
  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }
  return grouped;
}

/**
 * Turns the assignments into the rows the database stores — one per room the
 * shift used. Kept separate from `computeSessionResult`, which answers "what
 * did this shift produce" for reporting; this answers "what do we write down".
 */
export function computeSessionAttributions(
  sessionId: string,
  assignments: SegmentAssignment[],
): AttributionDraft[] {
  const owned = assignments
    .filter(
      (assignment): assignment is Extract<SegmentAssignment, { kind: 'ATTRIBUTED' }> =>
        assignment.kind === 'ATTRIBUTED' && assignment.sessionId === sessionId,
    )
    .map((assignment) => assignment.segment);
  const shared = assignments
    .filter(
      (assignment): assignment is Extract<SegmentAssignment, { kind: 'SHARED_UNALLOCATED' }> =>
        assignment.kind === 'SHARED_UNALLOCATED' && assignment.sessionIds.includes(sessionId),
    )
    .map((assignment) => assignment.segment);

  // One stretch covering several shifts makes this shift's total unknowable,
  // including the stretches we could otherwise attribute: the boundary between
  // them is exactly what is missing. Nothing is split, nothing is guessed.
  if (shared.length > 0) {
    const drafts: AttributionDraft[] = [];
    for (const [roomId, segments] of groupByRoom([...owned, ...shared])) {
      drafts.push({
        sessionId,
        roomId,
        method: 'SHARED_UNALLOCATED',
        sourceSnapshotId: segments[segments.length - 1].sourceSnapshotId,
        prevSnapshotId: segments[0].prevSnapshotId,
        segmentStartAt: segments[0].startAt,
        segmentEndAt: segments[segments.length - 1].endAt,
        durationMinutes: null,
        metrics: emptyMetrics(),
        confidence: 'LOW',
        issues: segments.flatMap((segment) => segment.issues),
        computedReason:
          'Thiếu snapshot ở ranh giới bàn giao: đoạn này thuộc nhiều ca, chưa quy kết được cho ca nào',
      });
    }
    return drafts;
  }

  // A drop in a running total means the snapshots are out of order or tagged to
  // the wrong shift. No figure is written until Operation resolves it.
  const usable = owned.filter((segment) => !segment.issues.includes('NEGATIVE_DELTA'));
  const rejected = owned.filter((segment) => segment.issues.includes('NEGATIVE_DELTA'));
  if (usable.length === 0) return [];

  const byRoom = groupByRoom(usable);
  const multiRoom = byRoom.size > 1;
  const drafts: AttributionDraft[] = [];

  for (const [roomId, segments] of byRoom) {
    const issues = segments.flatMap((segment) => segment.issues);
    const last = segments[segments.length - 1];

    let confidence: DataConfidence;
    if (issues.length > 0 || rejected.length > 0) confidence = 'NEEDS_REVIEW';
    else if (multiRoom) confidence = 'MEDIUM';
    else confidence = 'HIGH';

    drafts.push({
      sessionId,
      roomId,
      method: multiRoom || segments.length > 1 ? 'ROOM_SUM' : segments[0].method,
      sourceSnapshotId: last.sourceSnapshotId,
      prevSnapshotId: segments[0].prevSnapshotId,
      segmentStartAt: segments[0].startAt,
      segmentEndAt: last.endAt,
      durationMinutes: segments.reduce((sum, segment) => sum + segment.durationMinutes, 0),
      metrics: sumMetrics(segments),
      confidence,
      issues,
      computedReason:
        rejected.length > 0
          ? 'Có đoạn bị loại vì số cộng dồn giảm so với snapshot trước'
          : null,
    });
  }

  return drafts;
}
