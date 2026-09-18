import { Decimal } from 'decimal.js';

/**
 * Ghi lại việc người đặt target theo hay không theo đề xuất (master prompt §9:
 * "Every override should be logged").
 *
 * Ghi cả hai chiều chứ không chỉ lúc lệch: mục đích không phải giám sát người
 * đặt, mà để sau này đối chiếu xem đề xuất của hệ thống hay phán đoán của con
 * người sát thực tế hơn. Chỉ ghi lúc lệch thì mẫu so sánh sẽ thiên lệch ngay từ
 * đầu.
 *
 * Cố ý **không** bắt nhập lý do. Target là quyết định của con người theo bản
 * chất, còn đề xuất chỉ là gợi ý — khác với override một con số do engine tính
 * ra, chỗ đó thì lý do là bắt buộc (CLAUDE.md §11).
 */
export type TargetChoiceAction = 'TARGET_FOLLOWED' | 'TARGET_OVERRIDDEN' | 'TARGET_SUGGESTION_IGNORED';

export interface TargetChoiceLog {
  action: TargetChoiceAction;
  suggestedGmv: string;
  chosenGmv: string | null;
  /** Lệch bao nhiêu phần trăm so với đề xuất, null khi không đặt target. */
  deviationPercent: number | null;
}

/** Dưới mức này coi như bấm "Dùng đề xuất" rồi làm tròn, không phải đặt khác. */
const SAME_WITHIN_PERCENT = 0.5;

/** Decimal ném lỗi với chuỗi rác chứ không trả NaN, nên phải bọc lại. */
function toDecimal(value: string): Decimal | null {
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

export function describeTargetChoice(
  suggestedGmv: string | null,
  chosenGmv: string | null,
): TargetChoiceLog | null {
  if (suggestedGmv === null) return null;

  const suggested = toDecimal(suggestedGmv);
  if (suggested === null || suggested.lessThanOrEqualTo(0)) return null;

  if (chosenGmv === null) {
    return {
      action: 'TARGET_SUGGESTION_IGNORED',
      suggestedGmv,
      chosenGmv: null,
      deviationPercent: null,
    };
  }

  const chosen = toDecimal(chosenGmv);
  // Giá trị nhập hỏng thì coi như chưa đặt target, thay vì ghi một mức lệch vô nghĩa.
  if (chosen === null) {
    return {
      action: 'TARGET_SUGGESTION_IGNORED',
      suggestedGmv,
      chosenGmv: null,
      deviationPercent: null,
    };
  }

  const deviation = chosen.minus(suggested).dividedBy(suggested).times(100).toNumber();

  return {
    action:
      Math.abs(deviation) <= SAME_WITHIN_PERCENT ? 'TARGET_FOLLOWED' : 'TARGET_OVERRIDDEN',
    suggestedGmv,
    chosenGmv,
    deviationPercent: deviation,
  };
}
