import type { AttributionMethod, DataConfidence, SessionOwnership } from '../attribution/types';
import type { SessionEventType } from './events';

export interface DetailSnapshot {
  snapshotId: string;
  endAt: string;
  gmv: string | null;
  orders: number | null;
  /** The upload this figure arrived in, so the original file stays reachable. */
  importId: string | null;
  fileName: string | null;
}

export interface DetailAttribution {
  id: string;
  method: AttributionMethod;
  confidence: DataConfidence;
  platformRoomId: string | null;
  segmentStartAt: string | null;
  segmentEndAt: string | null;
  durationMinutes: number | null;
  gmv: string | null;
  orders: number | null;
  itemsSold: number | null;
  customers: number | null;
  views: number | null;
  productImpressions: number | null;
  productClicks: number | null;
  newFollowers: number | null;
  sourceSnapshot: DetailSnapshot | null;
  previousSnapshot: DetailSnapshot | null;
  computedReason: string | null;
  overrideReason: string | null;
  computedAt: string;
  isCurrent: boolean;
}

export interface DetailEvent {
  id: string;
  eventType: SessionEventType;
  occurredAt: string;
  reason: string | null;
  actorName: string | null;
  reviewStatus: string;
}

export interface DetailAudit {
  id: string;
  action: string;
  reason: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface DetailStaff {
  name: string;
  role: 'HOST' | 'ASSISTANT';
  startedAt: string | null;
  endedAt: string | null;
}

export interface SessionDetail {
  sessionId: string;
  brandName: string;
  sessionDate: string;
  status: string;
  ownership: SessionOwnership;
  confidence: DataConfidence | null;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  targetGmv: string | null;
  staff: DetailStaff[];
  events: DetailEvent[];
  attributions: DetailAttribution[];
  auditLogs: DetailAudit[];
}
