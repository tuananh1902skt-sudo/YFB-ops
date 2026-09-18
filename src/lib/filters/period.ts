import { platformToday } from '../planning/schedule-view';

/**
 * Khoảng thời gian dùng chung cho mọi màn hình phân tích (master prompt §43).
 *
 * Trạng thái nằm trên URL chứ không trong bộ nhớ trình duyệt: một khoảng thời
 * gian đang xem phải gửi cho đồng nghiệp được, và server phải đọc được nó để
 * render — dữ liệu không bao giờ tải hết về trình duyệt rồi lọc ở đó (§51).
 */

export type PresetCode = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_7' | 'LAST_30';

export interface Period {
  from: string;
  to: string;
  label: string;
  /** Preset đang khớp, hoặc null nếu người dùng tự chọn ngày. */
  preset: PresetCode | null;
}

const MONTHS = 'tháng';

/** Cộng ngày trên lịch, giữ nguyên một múi giờ từ đầu tới cuối (docs/06 §3.3). */
function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function endOfMonth(date: string): string {
  const value = new Date(`${startOfMonth(date)}T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + 1);
  value.setUTCDate(0);
  return value.toISOString().slice(0, 10);
}

function monthLabel(date: string): string {
  return `${MONTHS} ${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

export function presetPeriod(code: PresetCode, today = platformToday()): Period {
  switch (code) {
    case 'THIS_MONTH':
      return { from: startOfMonth(today), to: today, label: monthLabel(today), preset: code };
    case 'LAST_MONTH': {
      const lastMonthDay = addDays(startOfMonth(today), -1);
      return {
        from: startOfMonth(lastMonthDay),
        to: endOfMonth(lastMonthDay),
        label: monthLabel(lastMonthDay),
        preset: code,
      };
    }
    case 'LAST_7':
      return { from: addDays(today, -6), to: today, label: '7 ngày gần nhất', preset: code };
    case 'LAST_30':
      return { from: addDays(today, -29), to: today, label: '30 ngày gần nhất', preset: code };
  }
}

export const PRESETS: { code: PresetCode; label: string }[] = [
  { code: 'THIS_MONTH', label: 'Tháng này' },
  { code: 'LAST_MONTH', label: 'Tháng trước' },
  { code: 'LAST_7', label: '7 ngày' },
  { code: 'LAST_30', label: '30 ngày' },
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function customLabel(from: string, to: string): string {
  const day = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}`;
  return from === to ? day(from) : `${day(from)} – ${day(to)}`;
}

/**
 * Đọc khoảng thời gian từ query string. Tham số hỏng thì rơi về mặc định thay vì
 * báo lỗi — một URL bị cắt khi copy không được phép làm hỏng cả trang.
 */
export function readPeriod(
  params: { from?: string; to?: string; preset?: string },
  today = platformToday(),
): Period {
  const presetCode = PRESETS.find((item) => item.code === params.preset)?.code;
  if (presetCode) return presetPeriod(presetCode, today);

  const { from, to } = params;
  if (from && to && DATE.test(from) && DATE.test(to) && from <= to) {
    // Người dùng tự gõ đúng bằng một preset thì vẫn hiện tên preset đó.
    const matched = PRESETS.map((item) => presetPeriod(item.code, today)).find(
      (period) => period.from === from && period.to === to,
    );
    return matched ?? { from, to, label: customLabel(from, to), preset: null };
  }

  return presetPeriod('THIS_MONTH', today);
}
