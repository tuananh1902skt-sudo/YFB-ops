import type { Decimal } from 'decimal.js';

/**
 * Target Engine (master prompt §9, docs/05 §7b).
 *
 * Hệ thống **gợi ý một khoảng**, không tự đặt target. Mọi hệ số đều đo từ lịch
 * sử của chính brand đó — một hệ số viết cứng trong code là con số bịa, đúng cho
 * brand này và sai cho brand kia mà không ai biết.
 */

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface HistoricalShift {
  sessionId: string;
  sessionDate: string;
  campaignTypeCode: string | null;
  hostNames: string[];
  /** Chuỗi để không mất chính xác khi đi qua JSON. */
  gmv: string;
  liveMinutes: number;
}

export interface FactorInput {
  /** Số giờ live theo kế hoạch của ca sắp đặt target. */
  plannedHours: number;
  campaignTypeCode: string | null;
  hostNames: string[];
}

export interface TargetFactor {
  code: string;
  label: string;
  /** null = không áp dụng được, và `reason` nói tại sao. */
  multiplier: number | null;
  /** Câu giải thích hệ số này đo từ đâu, hiện thẳng cho người đọc. */
  basis: string;
  sampleSize: number;
  applied: boolean;
}

export interface TargetRecommendation {
  /** null khi không đủ dữ liệu để đề xuất — kèm `blockedReason`. */
  point: Decimal | null;
  low: Decimal | null;
  high: Decimal | null;
  baselineGmvPerHour: Decimal | null;
  plannedHours: number;
  confidence: ConfidenceLevel;
  sampleSize: number;
  factors: TargetFactor[];
  /** Yếu tố master prompt §9 liệt kê mà hệ thống chưa có nguồn dữ liệu. */
  missingInputs: string[];
  blockedReason: string | null;
}

export interface TargetSettings {
  /** Dưới ngưỡng này thì không đề xuất, thay vì đề xuất một con số trông hợp lý. */
  minSamples: number;
  confidenceHighSamples: number;
  confidenceMediumSamples: number;
  /** Cửa sổ "gần đây" dùng để đo xu hướng. */
  recentWindowDays: number;
  /** Toàn bộ lịch sử được xét. */
  historyWindowDays: number;
  /** Mẫu tối thiểu để một hệ số (campaign, host) được áp dụng. */
  minFactorSamples: number;
}

export const DEFAULT_TARGET_SETTINGS: TargetSettings = {
  minSamples: 6,
  confidenceHighSamples: 20,
  confidenceMediumSamples: 10,
  recentWindowDays: 30,
  historyWindowDays: 90,
  minFactorSamples: 3,
};
