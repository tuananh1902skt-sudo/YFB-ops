import type { Decimal } from 'decimal.js';

/**
 * Display conventions from docs/06 §3.3. Everything the user reads goes through
 * here, so a number never appears in two different shapes on two screens.
 */
export const PLATFORM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const moneyFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const timeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: PLATFORM_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: PLATFORM_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** A figure that could not be measured, never shown as `0` (docs/06 §3.4). */
export const NOT_AVAILABLE = '—';

export function formatMoney(value: Decimal | number | string | null): string {
  if (value === null) return NOT_AVAILABLE;
  const amount = typeof value === 'number' ? value : Number(value.toString());
  return `${moneyFormatter.format(Math.round(amount))} ₫`;
}

export function formatCount(value: number | null): string {
  return value === null ? NOT_AVAILABLE : moneyFormatter.format(value);
}

export function formatTime(instant: Date): string {
  return timeFormatter.format(instant);
}

export function formatDate(instant: Date): string {
  return dateFormatter.format(instant);
}

/** `20:00 → 00:36 (10/09)` — the next day is spelled out, never implied. */
export function formatTimeRange(from: Date, to: Date): string {
  const sameDay = dateFormatter.format(from) === dateFormatter.format(to);
  const end = sameDay
    ? formatTime(to)
    : `${formatTime(to)} (${dateFormatter.format(to).slice(0, 5)})`;
  return `${formatTime(from)} → ${end}`;
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return NOT_AVAILABLE;
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return hours === 0 ? `${rest}m` : `${hours}h ${String(rest).padStart(2, '0')}m`;
}
