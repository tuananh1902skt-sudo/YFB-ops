import { describe, expect, it } from 'vitest';
import { presetPeriod, readPeriod } from '../period';

const TODAY = '2026-09-18';

describe('khoảng thời gian dùng chung', () => {
  it('tháng này tính từ mùng 1 tới hôm nay, không tới cuối tháng', () => {
    expect(presetPeriod('THIS_MONTH', TODAY)).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-18',
      label: 'tháng 09/2026',
    });
  });

  it('tháng trước lấy trọn tháng', () => {
    expect(presetPeriod('LAST_MONTH', TODAY)).toMatchObject({
      from: '2026-08-01',
      to: '2026-08-31',
      label: 'tháng 08/2026',
    });
  });

  it('tháng trước qua mốc đầu năm vẫn đúng', () => {
    expect(presetPeriod('LAST_MONTH', '2026-01-09')).toMatchObject({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });

  it('tháng trước của tháng 3 ra tháng 2 đúng số ngày', () => {
    expect(presetPeriod('LAST_MONTH', '2026-03-15').to).toBe('2026-02-28');
    expect(presetPeriod('LAST_MONTH', '2024-03-15').to).toBe('2024-02-29');
  });

  it('7 ngày gần nhất tính cả hôm nay', () => {
    expect(presetPeriod('LAST_7', TODAY)).toMatchObject({ from: '2026-09-12', to: '2026-09-18' });
  });

  it('không có tham số thì mặc định tháng này', () => {
    expect(readPeriod({}, TODAY).preset).toBe('THIS_MONTH');
  });

  it('nhận ngày tự chọn', () => {
    expect(readPeriod({ from: '2026-09-08', to: '2026-09-13' }, TODAY)).toMatchObject({
      from: '2026-09-08',
      to: '2026-09-13',
      label: '08/09 – 13/09',
      preset: null,
    });
  });

  it('ngày tự chọn trùng một preset thì hiện tên preset đó', () => {
    expect(readPeriod({ from: '2026-09-01', to: '2026-09-18' }, TODAY).preset).toBe('THIS_MONTH');
  });

  it('tham số hỏng thì rơi về mặc định, không làm đổ trang', () => {
    for (const params of [
      { from: 'hôm qua', to: '2026-09-18' },
      { from: '2026-09-20', to: '2026-09-10' },
      { from: '2026-09-01' },
      { preset: 'KHONG_CO' },
    ]) {
      expect(readPeriod(params, TODAY).preset).toBe('THIS_MONTH');
    }
  });

  it('preset thắng ngày tự chọn khi cả hai cùng có trên URL', () => {
    expect(
      readPeriod({ preset: 'LAST_7', from: '2026-01-01', to: '2026-01-02' }, TODAY).from,
    ).toBe('2026-09-12');
  });
});
