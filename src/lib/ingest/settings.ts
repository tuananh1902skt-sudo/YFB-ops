import { MAX_CONTINUITY_GAP_MINUTES, MIN_OVERLAP_MINUTES, MIN_OVERLAP_RATIO } from '../attribution/engine';

/**
 * Thresholds live in `system_settings` so Operation can change them without a
 * deploy (CLAUDE.md §12). The constants below are the fallback when a key is
 * missing, never a second source of truth.
 */
export interface IngestSettings {
  maxContinuityGapMinutes: number;
  minOverlapMinutes: number;
  minOverlapRatio: number;
}

function numberSetting(raw: unknown, fallback: number): number {
  const value = typeof raw === 'string' ? Number(raw) : raw;
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function readSettings(stored: Record<string, unknown>): IngestSettings {
  return {
    maxContinuityGapMinutes:
      numberSetting(stored.room_continuity_max_gap_hours, MAX_CONTINUITY_GAP_MINUTES / 60) * 60,
    minOverlapMinutes: numberSetting(stored.segment_match_min_overlap_minutes, MIN_OVERLAP_MINUTES),
    minOverlapRatio: numberSetting(stored.segment_match_min_overlap_ratio, MIN_OVERLAP_RATIO),
  };
}
