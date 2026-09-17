import {
  assignSegments,
  computeRoomSegments,
  computeSessionAttributions,
} from '../attribution/engine';
import type { AttributionDraft, RoomSegment, SegmentAssignment } from '../attribution/types';
import { toPlatformDateString } from '../parsing/primitives';
import { readSettings } from './settings';
import type {
  IngestRepository,
  RoomRecord,
  SessionDataState,
  SessionRecord,
  SnapshotRecord,
} from './types';

export interface DiscoveredSessionOutcome {
  sessionId: string;
  startAt: Date;
  endAt: Date;
}

export interface SessionOutcome {
  sessionId: string;
  drafts: AttributionDraft[];
  /** Stretches left out because the running total went backwards (docs/07 C7). */
  rejected: RoomSegment[];
}

export interface RecomputeResult {
  sessions: SessionOutcome[];
  discovered: DiscoveredSessionOutcome[];
  /** Stretches whose figures dropped out because a running total went backwards. */
  rejectedSegments: RoomSegment[];
  /** What the calculation was made from, so a screen can show its working. */
  rooms: RoomRecord[];
  snapshots: SnapshotRecord[];
  sessionWindows: SessionRecord[];
}

/** Room stretches nobody booked, merged while they run back to back. */
function mergeUnmatchedRuns(assignments: SegmentAssignment[]): RoomSegment[][] {
  const runs: RoomSegment[][] = [];
  let current: RoomSegment[] = [];

  for (const assignment of assignments) {
    if (assignment.kind !== 'UNMATCHED') {
      if (current.length > 0) runs.push(current);
      current = [];
      continue;
    }
    const previous = current[current.length - 1];
    const continues =
      previous &&
      previous.roomId === assignment.segment.roomId &&
      previous.endAt.getTime() === assignment.segment.startAt.getTime();

    if (continues) current.push(assignment.segment);
    else {
      if (current.length > 0) runs.push(current);
      current = [assignment.segment];
    }
  }
  if (current.length > 0) runs.push(current);

  return runs;
}

function dataState(outcome: SessionOutcome): SessionDataState['status'] {
  const { drafts, rejected } = outcome;
  // Data arrived but none of it could be used: that is a shift to look at, not
  // a shift still waiting for its upload.
  if (drafts.length === 0) return rejected.length > 0 ? 'DATA_PARTIAL' : 'DATA_PENDING';
  const settled = drafts.every(
    (draft) => draft.method !== 'SHARED_UNALLOCATED' && draft.confidence !== 'NEEDS_REVIEW',
  );
  return settled ? 'DATA_COMPLETE' : 'DATA_PARTIAL';
}

const CONFIDENCE_RANK = { HIGH: 1, MEDIUM: 2, LOW: 3, NEEDS_REVIEW: 4 } as const;

function weakestConfidence(outcome: SessionOutcome): AttributionDraft['confidence'] | null {
  if (outcome.rejected.length > 0) return 'NEEDS_REVIEW';
  if (outcome.drafts.length === 0) return null;
  return outcome.drafts.reduce((weakest, draft) =>
    CONFIDENCE_RANK[draft.confidence] > CONFIDENCE_RANK[weakest.confidence] ? draft : weakest,
  ).confidence;
}

/**
 * Recomputes every shift touching a window, from the snapshots on record.
 *
 * Attribution is always derived, never accumulated: an import, an Operation
 * correction and a replay of both must all land on the same numbers. The shift
 * boundaries that were unknown at upload time (a late bulk file, a handover
 * logged afterwards) are therefore picked up automatically.
 */
export async function recomputeWindow(
  repo: IngestRepository,
  platformAccountId: string,
  from: Date,
  to: Date,
): Promise<RecomputeResult> {
  const settings = readSettings(await repo.getSettings());

  const sessions = await repo.listSessionsInWindow(platformAccountId, from, to);
  // A shift may reach outside the imported window (it restarted, or it started
  // before the first snapshot), so widen to cover every shift found.
  const windowStart = new Date(
    Math.min(from.getTime(), ...sessions.map((session) => session.startAt.getTime())),
  );
  const windowEnd = new Date(
    Math.max(to.getTime(), ...sessions.map((session) => session.endAt.getTime())),
  );

  const rooms = await repo.listRoomsInWindow(platformAccountId, windowStart, windowEnd);
  const snapshots = await repo.listSnapshots(rooms.map((room) => room.id));
  const segments = buildSegments(rooms, snapshots, settings.maxContinuityGapMinutes);

  const matchOptions = {
    minOverlapMinutes: settings.minOverlapMinutes,
    minOverlapRatio: settings.minOverlapRatio,
  };
  let assignments = assignSegments(
    segments,
    sessions.map((session) => ({
      sessionId: session.id,
      startAt: session.startAt,
      endAt: session.endAt,
    })),
    matchOptions,
  );

  // A stretch nobody booked is not assumed to be the agency's, and not assumed
  // to be the brand's either: it becomes a shift marked UNKNOWN for Operation
  // to classify (docs/01 §3). Until they do, it is excluded from every KPI.
  const discovered: DiscoveredSessionOutcome[] = [];
  const discoveredSessions: SessionRecord[] = [];
  const claimed = new Map<RoomSegment, string>();

  for (const run of mergeUnmatchedRuns(assignments)) {
    const startAt = run[0].startAt;
    const endAt = run[run.length - 1].endAt;
    const session = await repo.createDiscoveredSession({
      platformAccountId,
      sessionDate: toPlatformDateString(startAt),
      startAt,
      endAt,
      note: 'Hệ thống phát hiện từ dữ liệu nền tảng, chưa khớp ca nào đã book',
    });
    discovered.push({ sessionId: session.id, startAt, endAt });
    discoveredSessions.push(session);
    for (const segment of run) claimed.set(segment, session.id);
  }

  if (claimed.size > 0) {
    // Assigned directly rather than re-matched: these windows were built from
    // the segments themselves, so re-running the matcher could only blur them.
    assignments = assignments.map((assignment) => {
      const sessionId = claimed.get(assignment.segment);
      return sessionId ? { kind: 'ATTRIBUTED' as const, sessionId, segment: assignment.segment } : assignment;
    });
  }

  const sessionIds = [
    ...new Set(
      assignments.flatMap((assignment) => {
        if (assignment.kind === 'ATTRIBUTED') return [assignment.sessionId];
        if (assignment.kind === 'SHARED_UNALLOCATED') return assignment.sessionIds;
        return [];
      }),
    ),
  ];

  const outcomes: SessionOutcome[] = sessionIds.map((sessionId) => ({
    sessionId,
    drafts: computeSessionAttributions(sessionId, assignments),
    rejected: assignments
      .filter(
        (assignment) =>
          assignment.kind === 'ATTRIBUTED' &&
          assignment.sessionId === sessionId &&
          assignment.segment.issues.includes('NEGATIVE_DELTA'),
      )
      .map((assignment) => assignment.segment),
  }));

  await repo.supersedeAttributions(sessionIds);
  await repo.insertAttributions(outcomes.flatMap((outcome) => outcome.drafts));
  await repo.updateSessionDataState(
    outcomes.map((outcome) => ({
      sessionId: outcome.sessionId,
      status: dataState(outcome),
      dataConfidence: weakestConfidence(outcome),
    })),
  );

  return {
    sessions: outcomes,
    discovered,
    rejectedSegments: segments.filter((segment) => segment.issues.includes('NEGATIVE_DELTA')),
    rooms,
    snapshots,
    sessionWindows: [...sessions, ...discoveredSessions],
  };
}

function buildSegments(
  rooms: RoomRecord[],
  snapshots: SnapshotRecord[],
  maxContinuityGapMinutes: number,
): RoomSegment[] {
  const byRoom = new Map<string, SnapshotRecord[]>();
  for (const snapshot of snapshots) {
    const bucket = byRoom.get(snapshot.roomId);
    if (bucket) bucket.push(snapshot);
    else byRoom.set(snapshot.roomId, [snapshot]);
  }

  return rooms
    .flatMap((room) =>
      computeRoomSegments(
        {
          roomId: room.id,
          startAt: room.roomStartAt,
          snapshots: (byRoom.get(room.id) ?? []).map((snapshot) => ({
            snapshotId: snapshot.id,
            endAt: snapshot.snapshotEndAt,
            metrics: snapshot.metrics,
          })),
        },
        { maxContinuityGapMinutes },
      ),
    )
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

export type { SessionRecord };
