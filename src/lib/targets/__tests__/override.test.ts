import { describe, expect, it } from 'vitest';
import { describeTargetChoice } from '../override';

describe('ghi nhận lựa chọn target', () => {
  it('không có đề xuất thì không ghi gì', () => {
    expect(describeTargetChoice(null, '30000000')).toBeNull();
  });

  it('đặt đúng bằng đề xuất thì ghi là đã theo', () => {
    expect(describeTargetChoice('30000000', '30000000')).toMatchObject({
      action: 'TARGET_FOLLOWED',
      deviationPercent: 0,
    });
  });

  it('lệch trong khoảng làm tròn vẫn coi là đã theo', () => {
    expect(describeTargetChoice('30000000', '30100000')?.action).toBe('TARGET_FOLLOWED');
  });

  it('đặt cao hơn hẳn thì ghi là đặt khác, kèm mức lệch', () => {
    const log = describeTargetChoice('30000000', '45000000')!;

    expect(log.action).toBe('TARGET_OVERRIDDEN');
    expect(log.deviationPercent).toBeCloseTo(50, 5);
  });

  it('đặt thấp hơn cho ra mức lệch âm', () => {
    expect(describeTargetChoice('30000000', '24000000')!.deviationPercent).toBeCloseTo(-20, 5);
  });

  it('có đề xuất mà không đặt target thì vẫn ghi lại', () => {
    expect(describeTargetChoice('30000000', null)).toMatchObject({
      action: 'TARGET_SUGGESTION_IGNORED',
      deviationPercent: null,
    });
  });

  it('đề xuất bằng 0 hoặc không hợp lệ thì bỏ qua, không chia cho 0', () => {
    expect(describeTargetChoice('0', '30000000')).toBeNull();
    expect(describeTargetChoice('không phải số', '30000000')).toBeNull();
  });

  it('giá trị đặt hỏng thì coi như chưa đặt, không ghi mức lệch vô nghĩa', () => {
    expect(describeTargetChoice('30000000', 'ba mươi triệu')).toMatchObject({
      action: 'TARGET_SUGGESTION_IGNORED',
      deviationPercent: null,
    });
  });
});
