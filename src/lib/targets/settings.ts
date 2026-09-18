import { DEFAULT_TARGET_SETTINGS, type TargetSettings } from './types';

/**
 * Ngưỡng đọc từ `system_settings`; các hằng số trong `types.ts` là mức dự phòng
 * khi thiếu key, không phải nguồn sự thật thứ hai (CLAUDE.md §12).
 */
function numberSetting(raw: unknown, fallback: number): number {
  const value = typeof raw === 'string' ? Number(raw) : raw;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function readTargetSettings(stored: Record<string, unknown>): TargetSettings {
  return {
    minSamples: numberSetting(stored.target_min_samples, DEFAULT_TARGET_SETTINGS.minSamples),
    confidenceHighSamples: numberSetting(
      stored.target_confidence_high_samples,
      DEFAULT_TARGET_SETTINGS.confidenceHighSamples,
    ),
    confidenceMediumSamples: numberSetting(
      stored.target_confidence_medium_samples,
      DEFAULT_TARGET_SETTINGS.confidenceMediumSamples,
    ),
    recentWindowDays: numberSetting(
      stored.target_recent_window_days,
      DEFAULT_TARGET_SETTINGS.recentWindowDays,
    ),
    historyWindowDays: numberSetting(
      stored.target_history_window_days,
      DEFAULT_TARGET_SETTINGS.historyWindowDays,
    ),
    minFactorSamples: numberSetting(
      stored.target_min_factor_samples,
      DEFAULT_TARGET_SETTINGS.minFactorSamples,
    ),
  };
}
