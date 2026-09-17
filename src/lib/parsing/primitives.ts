import { Decimal } from 'decimal.js';

/** Export files record wall-clock time in GMT+7 (docs/01_BUSINESS_RULES.md §12). */
export const PLATFORM_UTC_OFFSET = '+07:00';

export class ParseError extends Error {
  constructor(
    readonly field: string,
    readonly rawValue: unknown,
    reason: string,
  ) {
    super(`${field}: ${reason} (nhận được: ${JSON.stringify(rawValue)})`);
    this.name = 'ParseError';
  }
}

/**
 * Empty cells mean "not measurable" (zero denominator), never zero.
 * Keeping them null is what stops averages from being dragged down.
 */
function blankToNull(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  return text === '' ? null : text;
}

export function parseMoney(raw: unknown, field = 'money'): Decimal | null {
  const text = blankToNull(raw);
  if (text === null) return null;

  const cleaned = text.replace(/[₫\s]/g, '').replace(/VND$/i, '').replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    throw new ParseError(field, raw, 'không phải giá trị tiền hợp lệ');
  }
  return new Decimal(cleaned);
}

/**
 * Stored as a percentage (12.5 means 12.5%), never as a 0–1 ratio.
 * Values above 100% are legitimate: engagement rates use viewers as denominator.
 */
export function parsePercent(raw: unknown, field = 'percent'): number | null {
  const text = blankToNull(raw);
  if (text === null) return null;

  const cleaned = text.replace(/%/g, '').replace(/,/g, '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    throw new ParseError(field, raw, 'không phải tỷ lệ phần trăm hợp lệ');
  }
  return Number(cleaned);
}

export function parseInteger(raw: unknown, field = 'integer'): number | null {
  const text = blankToNull(raw);
  if (text === null) return null;

  const cleaned = text.replace(/,/g, '');
  if (!/^-?\d+$/.test(cleaned)) {
    throw new ParseError(field, raw, 'không phải số nguyên hợp lệ');
  }
  return Number(cleaned);
}

export function parseDecimalNumber(raw: unknown, field = 'number'): number | null {
  const text = blankToNull(raw);
  if (text === null) return null;

  const cleaned = text.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    throw new ParseError(field, raw, 'không phải số hợp lệ');
  }
  return Number(cleaned);
}

/** TikTok writes durations as "3h55m" — minutes only, no seconds. */
export function parseDuration(raw: unknown, field = 'duration'): number | null {
  const text = blankToNull(raw);
  if (text === null) return null;

  const match = /^(\d+)h(\d+)m$/.exec(text);
  if (!match) {
    throw new ParseError(field, raw, 'không đúng định dạng "XhYm"');
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function parseTimestamp(raw: unknown, field = 'timestamp'): Date | null {
  const text = blankToNull(raw);
  if (text === null) return null;

  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(text);
  if (!match) {
    throw new ParseError(field, raw, 'không đúng định dạng "YYYY-MM-DD HH:mm:ss"');
  }

  const instant = new Date(`${match[1]}T${match[2]}${PLATFORM_UTC_OFFSET}`);
  if (Number.isNaN(instant.getTime())) {
    throw new ParseError(field, raw, 'không phải thời điểm hợp lệ');
  }
  return instant;
}

/**
 * Room IDs are 19 digits, past the range JavaScript numbers represent exactly.
 * They stay strings end to end; parsing one into a number corrupts it silently.
 */
export function parseRoomId(raw: unknown, field = 'Room ID'): string {
  const text = blankToNull(raw);
  if (text === null) {
    throw new ParseError(field, raw, 'không được để trống');
  }
  if (!/^\d+$/.test(text)) {
    throw new ParseError(field, raw, 'phải là chuỗi chữ số');
  }
  return text;
}

/** Operating day of a session is the day it started, in GMT+7. */
export function toPlatformDateString(instant: Date): string {
  const shifted = new Date(instant.getTime() + 7 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}
