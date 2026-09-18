import { describe, expect, it } from 'vitest';
import { recommendTarget } from '../recommend';
import { DEFAULT_TARGET_SETTINGS, type HistoricalShift } from '../types';

const TODAY = '2026-09-18';

/** `daysAgo` ngày trước hôm nay, ở lịch GMT+7 mà cả hệ thống dùng. */
function dateDaysAgo(daysAgo: number): string {
  const value = new Date(`${TODAY}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - daysAgo);
  return value.toISOString().slice(0, 10);
}

function shift(overrides: Partial<HistoricalShift> & { daysAgo: number }): HistoricalShift {
  const { daysAgo, ...rest } = overrides;
  return {
    sessionId: `s-${daysAgo}-${rest.campaignTypeCode ?? 'x'}-${rest.hostNames?.[0] ?? 'h'}`,
    sessionDate: dateDaysAgo(daysAgo),
    campaignTypeCode: 'DAILY',
    hostNames: ['Khói'],
    // 30tr trong 180 phút = 10tr/giờ
    gmv: '30000000',
    liveMinutes: 180,
    ...rest,
  };
}

/** `count` ca giống nhau, rải đều trong `spanDays` ngày gần nhất. */
function steadyHistory(count: number, spanDays = 60, extra: Partial<HistoricalShift> = {}) {
  return Array.from({ length: count }, (_, index) =>
    shift({ daysAgo: Math.round((index * spanDays) / count) + 1, ...extra, sessionId: `s${index}` }),
  );
}

const PLAN = { plannedHours: 3, campaignTypeCode: null, hostNames: [] };

describe('target engine', () => {
  it('không đề xuất khi chưa đủ lịch sử, và nói rõ còn thiếu bao nhiêu', () => {
    const result = recommendTarget(steadyHistory(3), PLAN, TODAY);

    expect(result.point).toBeNull();
    expect(result.blockedReason).toContain('3 ca');
    expect(result.blockedReason).toContain('6 ca');
  });

  it('không đề xuất khi ca chưa có khung giờ', () => {
    const result = recommendTarget(steadyHistory(20), { ...PLAN, plannedHours: 0 }, TODAY);

    expect(result.point).toBeNull();
    expect(result.blockedReason).toContain('chưa có khung giờ');
  });

  it('lịch sử ổn định 10tr/giờ, ca 3 tiếng thì đề xuất quanh 30tr', () => {
    const result = recommendTarget(steadyHistory(20), PLAN, TODAY);

    expect(result.point!.toNumber()).toBeCloseTo(30_000_000, -4);
    expect(result.baselineGmvPerHour!.toNumber()).toBeCloseTo(10_000_000, -4);
  });

  it('điểm giữa luôn nằm trong khoảng, kể cả khi dữ liệu gần lệch hẳn dữ liệu cũ', () => {
    // Lịch sử vừa phân tán vừa có xu hướng tăng: đây đúng là trường hợp làm
    // điểm giữa rơi ra ngoài khoảng nếu khoảng và điểm dựng trên hai gốc khác nhau.
    const history = [
      ...Array.from({ length: 12 }, (_, index) =>
        shift({ daysAgo: index * 2 + 1, sessionId: `new${index}`, gmv: '54000000' }),
      ),
      ...Array.from({ length: 12 }, (_, index) =>
        shift({ daysAgo: 45 + index * 2, sessionId: `old${index}`, gmv: '18000000' }),
      ),
    ];

    const result = recommendTarget(history, PLAN, TODAY);

    expect(result.low!.lessThanOrEqualTo(result.point!)).toBe(true);
    expect(result.high!.greaterThanOrEqualTo(result.point!)).toBe(true);
  });

  it('khoảng đề xuất bao lấy con số điểm', () => {
    const history = [
      ...steadyHistory(10, 40),
      ...steadyHistory(10, 40).map((item, index) => ({
        ...item,
        sessionId: `hi${index}`,
        gmv: '45000000',
      })),
    ];

    const result = recommendTarget(history, PLAN, TODAY);

    expect(result.low!.lessThan(result.point!)).toBe(true);
    expect(result.high!.greaterThan(result.point!)).toBe(true);
  });

  it('lịch sử đều tăm tắp thì khoảng thu về đúng một điểm — không nới ra cho đẹp', () => {
    const result = recommendTarget(steadyHistory(20), PLAN, TODAY);

    expect(result.low!.toNumber()).toBeCloseTo(result.high!.toNumber(), -3);
  });

  it('dữ liệu gần được ưu tiên hơn dữ liệu cũ', () => {
    const history = [
      ...steadyHistory(10, 20).map((item, index) => ({
        ...item,
        sessionId: `new${index}`,
        gmv: '60000000',
      })),
      ...Array.from({ length: 10 }, (_, index) =>
        shift({ daysAgo: 60 + index, sessionId: `old${index}`, gmv: '30000000' }),
      ),
    ];

    const result = recommendTarget(history, PLAN, TODAY);

    // Trung bình thường sẽ ra 15tr/giờ; có trọng số thời gian phải cao hơn hẳn.
    expect(result.baselineGmvPerHour!.toNumber()).toBeGreaterThan(16_000_000);
  });

  it('hệ số campaign đo từ lịch sử của chính brand, không phải số viết cứng', () => {
    const history = [
      ...steadyHistory(12, 60),
      ...Array.from({ length: 5 }, (_, index) =>
        shift({
          daysAgo: index * 8 + 2,
          sessionId: `pd${index}`,
          campaignTypeCode: 'PAYDAY',
          gmv: '60000000',
        }),
      ),
    ];

    const result = recommendTarget(
      history,
      { ...PLAN, campaignTypeCode: 'PAYDAY' },
      TODAY,
    );
    const campaign = result.factors.find((factor) => factor.code === 'CAMPAIGN')!;

    expect(campaign.applied).toBe(true);
    expect(campaign.multiplier).toBeCloseTo(2, 1);
    expect(campaign.basis).toContain('5 ca cùng loại');
  });

  it('không đủ mẫu thì hệ số bị bỏ qua và nói rõ lý do, không lặng lẽ coi bằng 1', () => {
    const history = [
      ...steadyHistory(12, 60),
      shift({ daysAgo: 5, sessionId: 'pd1', campaignTypeCode: 'PAYDAY', gmv: '60000000' }),
    ];

    const result = recommendTarget(history, { ...PLAN, campaignTypeCode: 'PAYDAY' }, TODAY);
    const campaign = result.factors.find((factor) => factor.code === 'CAMPAIGN')!;

    expect(campaign.applied).toBe(false);
    expect(campaign.multiplier).toBeNull();
    expect(campaign.basis).toContain('1 ca');
  });

  it('host mạnh hơn trung bình brand thì kéo đề xuất lên', () => {
    const history = [
      ...steadyHistory(12, 60),
      ...Array.from({ length: 5 }, (_, index) =>
        shift({
          daysAgo: index * 8 + 3,
          sessionId: `star${index}`,
          hostNames: ['Linh Ân'],
          gmv: '60000000',
        }),
      ),
    ];

    const base = recommendTarget(history, PLAN, TODAY);
    const withStar = recommendTarget(history, { ...PLAN, hostNames: ['Linh Ân'] }, TODAY);

    expect(withStar.point!.greaterThan(base.point!)).toBe(true);
  });

  it('bỏ ca không quy kết được và ca ngoài cửa sổ lịch sử', () => {
    const history = [
      ...steadyHistory(20, 60),
      shift({ daysAgo: 3, sessionId: 'no-minutes', liveMinutes: 0, gmv: '99000000' }),
      shift({ daysAgo: 400, sessionId: 'too-old', gmv: '99000000' }),
    ];

    const result = recommendTarget(history, PLAN, TODAY);

    expect(result.sampleSize).toBe(20);
  });

  it('độ tin cậy đi theo số mẫu', () => {
    expect(recommendTarget(steadyHistory(25), PLAN, TODAY).confidence).toBe('HIGH');
    expect(recommendTarget(steadyHistory(12), PLAN, TODAY).confidence).toBe('MEDIUM');
    expect(recommendTarget(steadyHistory(7), PLAN, TODAY).confidence).toBe('LOW');
  });

  it('ngưỡng đọc từ cấu hình, không phải số cứng', () => {
    const result = recommendTarget(steadyHistory(4), PLAN, TODAY, {
      ...DEFAULT_TARGET_SETTINGS,
      minSamples: 3,
    });

    expect(result.point).not.toBeNull();
  });

  it('luôn liệt kê những yếu tố hệ thống chưa có dữ liệu', () => {
    const result = recommendTarget(steadyHistory(20), PLAN, TODAY);

    expect(result.missingInputs.join(' ')).toContain('Tồn kho');
    expect(result.missingInputs.join(' ')).toContain('Ngân sách ads');
  });
});
