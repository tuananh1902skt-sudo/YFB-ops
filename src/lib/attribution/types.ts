import type { CumulativeMetrics } from '../parsing/live-performance';

export type AttributionMethod =
  | 'FULL_SNAPSHOT'
  | 'SNAPSHOT_DELTA'
  | 'ROOM_SUM'
  | 'MANUAL'
  | 'SHARED_UNALLOCATED';

export type DataConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NEEDS_REVIEW';

export type SessionOwnership = 'AGENCY' | 'BRAND_INHOUSE' | 'UNKNOWN';

export type SegmentIssue =
  | 'NEGATIVE_DELTA'
  | 'DUPLICATE_SNAPSHOT_TIME'
  | 'SNAPSHOT_BEFORE_ROOM_START';

export interface RoomSnapshotInput {
  snapshotId: string;
  endAt: Date;
  metrics: CumulativeMetrics;
}

export interface RoomInput {
  roomId: string;
  startAt: Date;
  snapshots: RoomSnapshotInput[];
}

/**
 * The slice of a room between two consecutive snapshots — what one shift
 * actually produced, once the running totals are differenced.
 */
export interface RoomSegment {
  roomId: string;
  sourceSnapshotId: string;
  prevSnapshotId: string | null;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  method: 'FULL_SNAPSHOT' | 'SNAPSHOT_DELTA';
  metrics: CumulativeMetrics;
  issues: SegmentIssue[];
}

export interface SessionWindow {
  sessionId: string;
  startAt: Date;
  endAt: Date;
}

export type SegmentAssignment =
  | { kind: 'ATTRIBUTED'; sessionId: string; segment: RoomSegment }
  /** Boundary snapshot missing: the figures belong to several shifts at once. */
  | { kind: 'SHARED_UNALLOCATED'; sessionIds: string[]; segment: RoomSegment }
  /** No booked shift covers this stretch — brand in-house until Operation says otherwise. */
  | { kind: 'UNMATCHED'; segment: RoomSegment };

export interface SessionResult {
  sessionId: string;
  method: AttributionMethod;
  metrics: CumulativeMetrics;
  liveMinutes: number | null;
  confidence: DataConfidence;
  roomIds: string[];
  sharedWithSessionIds: string[];
  issues: SegmentIssue[];
}
