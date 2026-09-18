/**
 * Ngưỡng dùng để quyết định "cái này có đáng nêu ra không".
 *
 * Đây là quyết định kinh doanh, không phải hằng số kỹ thuật: mỗi agency chấp
 * nhận một mức khác nhau, và mức đó đổi theo từng giai đoạn. Vì vậy chúng nằm
 * trong `system_settings` để Operation sửa được mà không cần deploy
 * (CLAUDE.md §12). Các giá trị dưới đây là mức dự phòng khi thiếu key, không
 * phải nguồn sự thật thứ hai.
 */
export interface AnalyticsThresholds {
  /** Dưới mức đạt target này thì brand/kỳ được nêu lên đầu danh sách cần xem. */
  targetWarningPercent: number;
  /** Từ mức này trở lên, tỷ lệ ca có dữ liệu tin cậy coi là ổn. */
  confidenceGoodPercent: number;
  /** Dưới mức này thì coi là nghiêm trọng, không chỉ là cần chú ý. */
  confidenceWarningPercent: number;
}

export const DEFAULT_THRESHOLDS: AnalyticsThresholds = {
  targetWarningPercent: 90,
  confidenceGoodPercent: 80,
  confidenceWarningPercent: 50,
};

function numberSetting(raw: unknown, fallback: number): number {
  const value = typeof raw === 'string' ? Number(raw) : raw;
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function readAnalyticsSettings(stored: Record<string, unknown>): AnalyticsThresholds {
  return {
    targetWarningPercent: numberSetting(
      stored.target_warning_percent,
      DEFAULT_THRESHOLDS.targetWarningPercent,
    ),
    confidenceGoodPercent: numberSetting(
      stored.data_confidence_good_percent,
      DEFAULT_THRESHOLDS.confidenceGoodPercent,
    ),
    confidenceWarningPercent: numberSetting(
      stored.data_confidence_warning_percent,
      DEFAULT_THRESHOLDS.confidenceWarningPercent,
    ),
  };
}
