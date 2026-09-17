import { describe, expect, it } from 'vitest';
import { parseLivePerformanceWorkbook } from '../../parsing/live-performance';
import { buildLiveWorkbook, type LiveRowInput } from '../../parsing/__tests__/fixtures';
import { importLivePerformance } from '../live-import';
import { previewLiveImport } from '../preview';
import { buildUploadPreview } from '../upload-preview';
import { MemoryRepository } from '../memory-repository';
import type { ImportContext } from '../types';

const ACCOUNT = 'account-1';
const ROOM_LONG = '7683365340126808852';

function context(fileHash: string): ImportContext {
  return {
    platformAccountId: ACCOUNT,
    uploadedBy: 'user-1',
    fileName: `Creator-Live-Performance_${fileHash}.xlsx`,
    fileHash,
    storagePath: `imports/${fileHash}.xlsx`,
  };
}

function at(value: string): Date {
  return new Date(`${value}+07:00`);
}

const morning: LiveRowInput = {
  roomId: ROOM_LONG,
  start: '2026-09-09 10:01:57',
  end: '2026-09-09 13:00:00',
  duration: '2h58m',
  gmv: '30,000,000.00₫',
  orders: '30',
};
const afternoon: LiveRowInput = {
  roomId: ROOM_LONG,
  start: '2026-09-09 10:01:57',
  end: '2026-09-09 16:02:48',
  duration: '6h00m',
  gmv: '77,025,508.90₫',
  orders: '82',
};

function sessions(repo: MemoryRepository) {
  repo.addSession({
    id: 'session-morning',
    brandId: 'brand-1',
    startAt: at('2026-09-09 10:00:00'),
    endAt: at('2026-09-09 13:00:00'),
  });
  repo.addSession({
    id: 'session-afternoon',
    brandId: 'brand-1',
    startAt: at('2026-09-09 13:00:00'),
    endAt: at('2026-09-09 16:00:00'),
  });
}

async function preview(repo: MemoryRepository, fileHash: string, rows: LiveRowInput[]) {
  const parsed = await parseLivePerformanceWorkbook(await buildLiveWorkbook(rows));
  const report = await previewLiveImport(repo, context(fileHash), parsed);
  return buildUploadPreview(report, context(fileHash).fileName);
}

async function commit(repo: MemoryRepository, fileHash: string, rows: LiveRowInput[]) {
  const parsed = await parseLivePerformanceWorkbook(await buildLiveWorkbook(rows));
  return importLivePerformance(repo, context(fileHash), parsed);
}

describe('màn hình nộp dữ liệu — xem trước', () => {
  it('xem trước không ghi gì vào kho dữ liệu thật', async () => {
    const repo = new MemoryRepository();
    sessions(repo);

    await preview(repo, 'hash-ca-sang', [morning]);

    expect(repo.snapshots).toHaveLength(0);
    expect(repo.attributions).toHaveLength(0);
    expect(repo.imports).toHaveLength(0);
    expect(repo.sessions).toHaveLength(2);
  });

  it('luôn hiện phép trừ chứ không chỉ hiện kết quả', async () => {
    const repo = new MemoryRepository();
    sessions(repo);
    await commit(repo, 'hash-ca-sang', [morning]);

    const result = await preview(repo, 'hash-ca-chieu', [morning, afternoon]);
    const shift = result.sessions.find((item) => item.sessionId === 'session-afternoon')!;

    expect(shift.gmvDisplay).toBe('47.025.509 ₫');
    expect(shift.calculation).toEqual([
      { operation: 'BASE', label: 'Số cộng dồn lúc 16:02', amount: '77.025.509 ₫' },
      { operation: 'SUBTRACT', label: 'Trừ số cộng dồn lúc 13:00', amount: '30.000.000 ₫' },
    ]);
    expect(shift.methodLabel).toBe('Trừ snapshot của ca trước');
    // A sound figure carries no badge, so a badge always means something.
    expect(shift.confidenceLabel).toBeNull();
    expect(result.canConfirm).toBe(true);
  });

  it('xem trước ra đúng con số mà lúc xác nhận sẽ lưu', async () => {
    const repo = new MemoryRepository();
    sessions(repo);
    await commit(repo, 'hash-ca-sang', [morning]);

    const shown = await preview(repo, 'hash-ca-chieu', [morning, afternoon]);
    await commit(repo, 'hash-ca-chieu', [morning, afternoon]);

    const stored = repo.currentFor('session-afternoon')[0];
    expect(shown.sessions.find((item) => item.sessionId === 'session-afternoon')!.gmvDisplay).toBe(
      '47.025.509 ₫',
    );
    expect(stored.metrics.gmv!.toString()).toBe('47025508.9');
  });

  it('file đã nộp rồi thì nói rõ và không cho xác nhận lại', async () => {
    const repo = new MemoryRepository();
    sessions(repo);
    await commit(repo, 'hash-ca-sang', [morning]);

    const result = await preview(repo, 'hash-ca-sang', [morning]);

    expect(result.status).toBe('DUPLICATE_FILE');
    expect(result.canConfirm).toBe(false);
    expect(result.notices[0].message).toContain('Đã nộp trước đó');
  });

  it('số cộng dồn giảm thì dừng lại, không tự sửa và không cho xác nhận', async () => {
    const repo = new MemoryRepository();
    sessions(repo);

    const result = await preview(repo, 'hash-sai', [
      morning,
      { ...afternoon, gmv: '20,000,000.00₫', orders: '20' },
    ]);

    const shift = result.sessions.find((item) => item.sessionId === 'session-afternoon')!;
    expect(shift.notices.some((notice) => notice.level === 'BLOCKING')).toBe(true);
    expect(shift.notices[0].message).toContain('nhỏ hơn lần nộp trước');
    expect(result.canConfirm).toBe(false);

    // Nothing could be worked out — which must not read like "shared between
    // shifts", and must not show a made-up zero.
    expect(shift.gmvDisplay).toBe('Chưa tính được');
    expect(shift.ordersDisplay).toBe('—');
    expect(shift.durationDisplay).toBe('—');
  });

  it('thiếu snapshot ranh giới thì hiện "Gộp chung", không hiện số chia đôi', async () => {
    const repo = new MemoryRepository();
    sessions(repo);

    const result = await preview(repo, 'hash-quen-nop', [afternoon]);

    for (const shift of result.sessions) {
      expect(shift.gmvDisplay).toBe('Gộp chung');
      expect(shift.confidenceLabel).toBe('Chưa quy kết');
      expect(shift.notices.some((notice) => notice.message.includes('không chia đôi'))).toBe(false);
    }
    expect(
      result.sessions[0].notices.some((notice) =>
        notice.action?.includes('không chia đôi doanh thu'),
      ),
    ).toBe(true);
    expect(result.canConfirm).toBe(false);
  });

  it('đoạn không khớp ca nào được nêu rõ là chờ Operation xác nhận', async () => {
    const repo = new MemoryRepository();

    const result = await preview(repo, 'hash-inhouse', [morning]);

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].isNewlyDiscovered).toBe(true);
    expect(result.sessions[0].ownership).toBe('UNKNOWN');
    expect(result.sessions[0].notices[0].message).toContain('không khớp ca nào đã book');
    // Nothing is wrong with the file, so it can still be submitted.
    expect(result.canConfirm).toBe(true);
  });

  it('file lạ cấu trúc thì nói rõ thiếu cột gì, không báo lỗi cụt', async () => {
    const repo = new MemoryRepository();
    const buffer = await buildLiveWorkbook([morning], {
      headerOverrides: { 'Attributed GMV': 'Tổng GMV' },
    });
    const parsed = await parseLivePerformanceWorkbook(buffer);
    const report = await previewLiveImport(repo, context('hash-la'), parsed);
    const result = buildUploadPreview(report, 'la.xlsx');

    expect(result.status).toBe('NEEDS_MAPPING');
    expect(result.notices[0].message).toContain('Attributed GMV');
    expect(result.canConfirm).toBe(false);
  });
});
