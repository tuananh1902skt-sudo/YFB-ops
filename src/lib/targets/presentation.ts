import { NOT_AVAILABLE, formatMoney, formatPercent } from '../format';
import type { ConfidenceLevel, TargetRecommendation } from './types';

/**
 * Bản đọc được của một đề xuất target.
 *
 * Nguyên tắc: **hiện cách tính, không chỉ hiện kết quả.** Một con số target mà
 * người đặt không hiểu nó ở đâu ra thì hoặc bị nhận bừa, hoặc bị bỏ qua — cả hai
 * đều làm hỏng mục đích của target.
 */
export interface TargetSuggestionView {
  available: boolean;
  blockedReason: string | null;
  rangeLabel: string;
  pointLabel: string;
  /** Giá trị điền vào ô nhập khi bấm "Dùng đề xuất", dạng số nguyên không dấu. */
  pointValue: string | null;
  baselineLabel: string;
  confidence: ConfidenceLevel;
  confidenceLabel: string;
  confidenceNote: string;
  factors: { label: string; effect: string; basis: string; applied: boolean }[];
  missingInputs: string[];
}

const CONFIDENCE: Record<ConfidenceLevel, { label: string; note: string }> = {
  HIGH: { label: 'Tin cậy cao', note: 'Đủ lịch sử để khoảng này có ý nghĩa.' },
  MEDIUM: {
    label: 'Tin cậy vừa',
    note: 'Lịch sử còn mỏng, khoảng thực tế có thể rộng hơn.',
  },
  LOW: {
    label: 'Tin cậy thấp',
    note: 'Rất ít dữ liệu — coi đây là điểm khởi đầu để bàn, không phải con số để cam kết.',
  },
};

/** `1,25` → `+25%`; `0,88` → `−12%`. Dấu nói ngay hướng tác động. */
function effectLabel(multiplier: number): string {
  const percent = (multiplier - 1) * 100;
  if (Math.abs(percent) < 0.5) return 'không đáng kể';
  const sign = percent > 0 ? '+' : '−';
  return `${sign}${formatPercent(Math.abs(percent))}`;
}

export function toSuggestionView(recommendation: TargetRecommendation): TargetSuggestionView {
  const { point, low, high, confidence } = recommendation;
  const meta = CONFIDENCE[confidence];

  return {
    available: point !== null,
    blockedReason: recommendation.blockedReason,
    rangeLabel:
      low === null || high === null
        ? NOT_AVAILABLE
        : `${formatMoney(low)} – ${formatMoney(high)}`,
    pointLabel: point === null ? NOT_AVAILABLE : formatMoney(point),
    pointValue: point === null ? null : point.toFixed(0),
    baselineLabel:
      recommendation.baselineGmvPerHour === null
        ? NOT_AVAILABLE
        : `${formatMoney(recommendation.baselineGmvPerHour)}/giờ × ${recommendation.plannedHours} giờ`,
    confidence,
    confidenceLabel: `${meta.label} · ${recommendation.sampleSize} ca`,
    confidenceNote: meta.note,
    factors: recommendation.factors.map((factor) => ({
      label: factor.label,
      effect: factor.applied ? effectLabel(factor.multiplier!) : 'không áp dụng',
      basis: factor.basis,
      applied: factor.applied,
    })),
    missingInputs: recommendation.missingInputs,
  };
}
