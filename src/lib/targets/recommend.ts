import { Decimal } from 'decimal.js';
import {
  DEFAULT_TARGET_SETTINGS,
  type ConfidenceLevel,
  type FactorInput,
  type HistoricalShift,
  type TargetFactor,
  type TargetRecommendation,
  type TargetSettings,
} from './types';

/**
 * Yếu tố master prompt §9 liệt kê mà hệ thống hiện **không có nguồn dữ liệu**.
 *
 * Liệt kê ra thay vì lặng lẽ coi bằng 1: người đọc phải biết đề xuất này chưa
 * tính tới chúng. Một con số trông đầy đủ mà thật ra thiếu đầu vào còn nguy hiểm
 * hơn một con số kèm danh sách những gì nó chưa biết.
 */
const MISSING_INPUTS = [
  'Tồn kho sản phẩm — file export TikTok chưa có dữ liệu SKU',
  'Voucher / mức giảm giá — chưa có nguồn',
  'Ngân sách ads cho ca — nền tảng chỉ cho số cấp ngày, toàn shop',
  'Mùa vụ — cần ít nhất một năm dữ liệu mới đo được',
];

function gmvPerHour(shift: HistoricalShift): Decimal | null {
  if (shift.liveMinutes <= 0) return null;
  return new Decimal(shift.gmv).dividedBy(shift.liveMinutes).times(60);
}

function rates(shifts: HistoricalShift[]): Decimal[] {
  return shifts
    .map(gmvPerHour)
    .filter((value): value is Decimal => value !== null && value.isFinite());
}

/** Cộng tử số và mẫu số gốc rồi chia lại, không lấy trung bình các tỷ lệ (CLAUDE.md §8). */
function pooledRate(shifts: HistoricalShift[]): Decimal | null {
  const usable = shifts.filter((shift) => shift.liveMinutes > 0);
  if (usable.length === 0) return null;
  const gmv = usable.reduce((sum, shift) => sum.plus(new Decimal(shift.gmv)), new Decimal(0));
  const minutes = usable.reduce((sum, shift) => sum + shift.liveMinutes, 0);
  if (minutes === 0) return null;
  return gmv.dividedBy(minutes).times(60);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Trung bình có trọng số theo thời gian: dữ liệu càng gần càng nặng.
 *
 * Trọng số giảm tuyến tính từ 1 (hôm nay) xuống 0 (hết cửa sổ lịch sử), thay vì
 * chia thành từng khối tháng — một ca ngày 31 và một ca ngày 32 không nên có
 * trọng số chênh nhau gấp đôi chỉ vì rơi khác khối.
 */
function weightedBaseline(
  shifts: HistoricalShift[],
  today: string,
  windowDays: number,
): Decimal | null {
  let weightedGmv = new Decimal(0);
  let weightedMinutes = new Decimal(0);

  for (const shift of shifts) {
    if (shift.liveMinutes <= 0) continue;
    const age = daysBetween(shift.sessionDate, today);
    const weight = Math.max(0, 1 - age / windowDays);
    if (weight === 0) continue;
    weightedGmv = weightedGmv.plus(new Decimal(shift.gmv).times(weight));
    weightedMinutes = weightedMinutes.plus(new Decimal(shift.liveMinutes).times(weight));
  }

  if (weightedMinutes.isZero()) return null;
  return weightedGmv.dividedBy(weightedMinutes).times(60);
}

/** Phân vị theo nội suy tuyến tính, đủ dùng ở cỡ mẫu vài chục ca. */
function percentile(values: Decimal[], fraction: number): Decimal | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a.comparedTo(b));
  if (sorted.length === 1) return sorted[0];
  const position = fraction * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower].plus(sorted[upper].minus(sorted[lower]).times(position - lower));
}

function ratioFactor(
  code: string,
  label: string,
  subset: HistoricalShift[],
  reference: Decimal | null,
  minSamples: number,
  describe: (subsetRate: Decimal, reference: Decimal) => string,
  missingReason: string,
): TargetFactor {
  const subsetRate = pooledRate(subset);
  if (subset.length < minSamples || subsetRate === null || reference === null || reference.isZero()) {
    return {
      code,
      label,
      multiplier: null,
      basis: missingReason,
      sampleSize: subset.length,
      applied: false,
    };
  }
  return {
    code,
    label,
    multiplier: subsetRate.dividedBy(reference).toNumber(),
    basis: describe(subsetRate, reference),
    sampleSize: subset.length,
    applied: true,
  };
}

function money(value: Decimal): string {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(
    Math.round(value.toNumber()),
  )} ₫`;
}

function confidenceOf(sampleSize: number, settings: TargetSettings): ConfidenceLevel {
  if (sampleSize >= settings.confidenceHighSamples) return 'HIGH';
  if (sampleSize >= settings.confidenceMediumSamples) return 'MEDIUM';
  return 'LOW';
}

/**
 * Chỉ nhận ca **đã quy kết được**. Ca dùng chung đoạn live không có con số riêng,
 * đưa vào baseline sẽ kéo lệch mà không ai thấy (docs/05 §10.1).
 */
export function usableHistory(
  shifts: HistoricalShift[],
  today: string,
  windowDays: number,
): HistoricalShift[] {
  return shifts.filter(
    (shift) =>
      shift.liveMinutes > 0 &&
      new Decimal(shift.gmv).greaterThan(0) &&
      daysBetween(shift.sessionDate, today) >= 0 &&
      daysBetween(shift.sessionDate, today) <= windowDays,
  );
}

export function recommendTarget(
  history: HistoricalShift[],
  input: FactorInput,
  today: string,
  settings: TargetSettings = DEFAULT_TARGET_SETTINGS,
): TargetRecommendation {
  const usable = usableHistory(history, today, settings.historyWindowDays);
  const empty = {
    point: null,
    low: null,
    high: null,
    baselineGmvPerHour: null,
    plannedHours: input.plannedHours,
    sampleSize: usable.length,
    factors: [],
    missingInputs: MISSING_INPUTS,
  };

  if (input.plannedHours <= 0) {
    return {
      ...empty,
      confidence: 'LOW',
      blockedReason: 'Ca chưa có khung giờ nên chưa tính được target.',
    };
  }

  if (usable.length < settings.minSamples) {
    return {
      ...empty,
      confidence: 'LOW',
      blockedReason:
        `Brand này mới có ${usable.length} ca đã quy kết trong ${settings.historyWindowDays} ngày, ` +
        `cần ít nhất ${settings.minSamples} ca thì đề xuất mới có nghĩa.`,
    };
  }

  const baseline = weightedBaseline(usable, today, settings.historyWindowDays);
  if (baseline === null || baseline.isZero()) {
    return {
      ...empty,
      confidence: 'LOW',
      blockedReason: 'Lịch sử chưa có ca nào đủ dữ liệu giờ live để dựng baseline.',
    };
  }

  const overall = pooledRate(usable);
  const recent = usable.filter(
    (shift) => daysBetween(shift.sessionDate, today) <= settings.recentWindowDays,
  );
  const earlier = usable.filter((shift) => {
    const age = daysBetween(shift.sessionDate, today);
    return age > settings.recentWindowDays && age <= settings.historyWindowDays;
  });

  const factors: TargetFactor[] = [
    ratioFactor(
      'TREND',
      'Xu hướng gần đây',
      recent,
      pooledRate(earlier),
      settings.minFactorSamples,
      (subsetRate, reference) =>
        `${recent.length} ca trong ${settings.recentWindowDays} ngày đạt ${money(subsetRate)}/giờ, ` +
        `so với ${money(reference)}/giờ của ${earlier.length} ca trước đó`,
      earlier.length < settings.minFactorSamples
        ? `Chưa đủ ca ở giai đoạn trước để so sánh (${earlier.length} ca)`
        : `Chưa đủ ca trong ${settings.recentWindowDays} ngày gần nhất (${recent.length} ca)`,
    ),
  ];

  if (input.campaignTypeCode) {
    const sameCampaign = usable.filter(
      (shift) => shift.campaignTypeCode === input.campaignTypeCode,
    );
    const daily = usable.filter((shift) => shift.campaignTypeCode !== input.campaignTypeCode);
    factors.push(
      ratioFactor(
        'CAMPAIGN',
        `Loại campaign ${input.campaignTypeCode}`,
        sameCampaign,
        pooledRate(daily),
        settings.minFactorSamples,
        (subsetRate, reference) =>
          `${sameCampaign.length} ca cùng loại đạt ${money(subsetRate)}/giờ, ` +
          `so với ${money(reference)}/giờ của các ca còn lại`,
        `Chưa đủ ca cùng loại campaign để đo (${sameCampaign.length} ca)`,
      ),
    );
  }

  if (input.hostNames.length > 0) {
    const sameHost = usable.filter((shift) =>
      shift.hostNames.some((name) => input.hostNames.includes(name)),
    );
    factors.push(
      ratioFactor(
        'HOST',
        `Host ${input.hostNames.join(', ')}`,
        sameHost,
        overall,
        settings.minFactorSamples,
        (subsetRate, reference) =>
          `${sameHost.length} ca của host này đạt ${money(subsetRate)}/giờ, ` +
          `so với ${money(reference)}/giờ trung bình brand`,
        `Chưa đủ ca của host này để đo (${sameHost.length} ca)`,
      ),
    );
  }

  const combined = factors.reduce(
    (product, factor) => (factor.applied ? product.times(factor.multiplier!) : product),
    new Decimal(1),
  );

  const hours = new Decimal(input.plannedHours);
  const point = baseline.times(combined).times(hours);

  // Độ rộng khoảng lấy từ phân vị 25–75 của chính lịch sử, nhưng dưới dạng **tỷ
  // lệ so với trung vị** rồi mới áp vào điểm giữa.
  //
  // Nhân thẳng phân vị với hệ số thì khoảng và điểm giữa được dựng trên hai gốc
  // khác nhau — baseline có trọng số thời gian, còn phân vị thì không — và điểm
  // giữa rơi ra ngoài khoảng. Một con số nằm ngoài chính khoảng của nó là kiểu
  // vô lý âm thầm làm hỏng lòng tin vào mọi con số còn lại.
  const spread = rates(usable);
  const median = percentile(spread, 0.5);
  const lowRatio = percentile(spread, 0.25);
  const highRatio = percentile(spread, 0.75);
  const hasSpread = median !== null && !median.isZero() && lowRatio !== null && highRatio !== null;

  return {
    point,
    low: hasSpread ? point.times(lowRatio.dividedBy(median)) : null,
    high: hasSpread ? point.times(highRatio.dividedBy(median)) : null,
    baselineGmvPerHour: baseline,
    plannedHours: input.plannedHours,
    confidence: confidenceOf(usable.length, settings),
    sampleSize: usable.length,
    factors,
    missingInputs: MISSING_INPUTS,
    blockedReason: null,
  };
}
