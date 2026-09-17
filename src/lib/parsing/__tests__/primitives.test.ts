import { describe, expect, it } from 'vitest';
import {
  ParseError,
  parseDuration,
  parseInteger,
  parseMoney,
  parsePercent,
  parseRoomId,
  parseTimestamp,
  toPlatformDateString,
} from '../primitives';

describe('A1 — parse tiền tệ', () => {
  it('đọc đúng chuỗi tiền có ₫ và dấu phân cách nghìn', () => {
    expect(parseMoney('18,764,427.98₫')?.toString()).toBe('18764427.98');
    expect(parseMoney('77,025,508.90₫')?.toString()).toBe('77025508.9');
    expect(parseMoney('0.00₫')?.toString()).toBe('0');
  });

  it('báo lỗi rõ ràng thay vì trả 0 khi chuỗi không hợp lệ', () => {
    expect(() => parseMoney('N/A', 'Attributed GMV')).toThrow(ParseError);
  });
});

describe('A2 — phần trăm vượt 100% vẫn hợp lệ', () => {
  it('giữ nguyên giá trị 1293.103448%', () => {
    expect(parsePercent('1293.103448%')).toBe(1293.103448);
  });
});

describe('A3 — chuỗi rỗng là NULL, không phải 0', () => {
  it('trả null cho mọi kiểu trường', () => {
    expect(parsePercent('')).toBeNull();
    expect(parseMoney('')).toBeNull();
    expect(parseInteger('')).toBeNull();
    expect(parseDuration('')).toBeNull();
    expect(parseTimestamp('')).toBeNull();
  });

  it('phân biệt null với 0 đo được thật', () => {
    expect(parsePercent('0%')).toBe(0);
    expect(parsePercent('')).toBeNull();
  });
});

describe('A4 — parse thời lượng', () => {
  it('đổi "XhYm" sang phút', () => {
    expect(parseDuration('3h55m')).toBe(235);
    expect(parseDuration('0h00m')).toBe(0);
    expect(parseDuration('6h00m')).toBe(360);
  });

  it('từ chối định dạng lạ', () => {
    expect(() => parseDuration('3:55')).toThrow(ParseError);
  });
});

describe('A5 — Room ID giữ nguyên độ chính xác', () => {
  it('trả về đúng chuỗi 19 chữ số', () => {
    const roomId = '7658657266417994504';
    expect(parseRoomId(roomId)).toBe(roomId);
  });

  it('chứng minh vì sao không được parse sang number', () => {
    const roomId = '7658657266417994504';
    expect(String(Number(roomId))).not.toBe(roomId);
    expect(parseRoomId(roomId)).not.toBe(String(Number(roomId)));
  });
});

describe('Thời gian GMT+7', () => {
  it('đọc mốc thời gian theo múi giờ nền tảng', () => {
    expect(parseTimestamp('2026-07-04 20:01:54')?.toISOString()).toBe('2026-07-04T13:01:54.000Z');
  });

  it('ca qua nửa đêm vẫn thuộc ngày bắt đầu', () => {
    const start = parseTimestamp('2026-09-14 19:43:15')!;
    const end = parseTimestamp('2026-09-15 00:34:43')!;
    expect(toPlatformDateString(start)).toBe('2026-09-14');
    expect(toPlatformDateString(end)).toBe('2026-09-15');
  });
});
