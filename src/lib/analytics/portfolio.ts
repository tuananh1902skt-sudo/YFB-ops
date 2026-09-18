import { Decimal } from 'decimal.js';
import { NOT_AVAILABLE, formatDuration, formatMoney, formatPercent } from '../format';
import { aov, gmvPerHour, targetAchievement, targetGap } from '../kpi/formulas';
import { sumRows, sumTargets, type DashboardSessionRow, type KpiTile } from './brand-dashboard';
import { DEFAULT_THRESHOLDS, type AnalyticsThresholds } from './settings';

/**
 * Tổng hợp nhiều brand cho Management.
 *
 * Không phải bản phóng to của dashboard brand. Người xem màn hình này không hỏi
 * "brand X bán được bao nhiêu" — họ hỏi "chỗ nào đang cần tôi". Vì vậy phần bảng
 * chỉ để so sánh, còn phần quan trọng nhất là danh sách việc cần xem, xếp theo
 * mức nghiêm trọng chứ không theo tên brand.
 */

export interface BrandPeriodInput {
  brandId: string;
  brandName: string;
  rows: DashboardSessionRow[];
  /** Tiền của các đoạn chung, không quy được về ca nào (docs/05 §10.1). */
  unallocatedGmv: Decimal | null;
}

export interface PortfolioBrandRow {
  brandId: string;
  brandName: string;
  /** Số trần để dựng hình học biểu đồ, không dùng cho số học tiền. */
  gmv: number;
  targetGmv: number | null;
  unallocatedGmv: number;
  gmvDisplay: string;
  targetDisplay: string;
  achievement: number | null;
  achievementDisplay: string;
  sessions: number;
  /** Ca không nằm trong con số GMV ở trên vì chưa tách được. */
  excludedSessions: number;
  liveHoursDisplay: string;
  gmvPerHourDisplay: string;
  aovDisplay: string;
  unallocatedDisplay: string | null;
  inhouseGmvDisplay: string;
}

export type AttentionSeverity = 'critical' | 'warning';

export interface AttentionItem {
  brandId: string;
  brandName: string;
  severity: AttentionSeverity;
  headline: string;
  detail: string;
  /** Màn hình xử lý được việc này, để không phải đi tìm. */
  href: string;
}

export interface Portfolio {
  periodLabel: string;
  brandCount: number;
  gmvDisplay: string;
  excludedSessions: number;
  unallocatedDisplay: string | null;
  tiles: KpiTile[];
  brands: PortfolioBrandRow[];
  attention: AttentionItem[];
  /** Một brand thì đây là màn hình sai — nói thẳng thay vì vẽ bảng một dòng. */
  singleBrand: boolean;
}

const SEVERITY_ORDER: Record<AttentionSeverity, number> = { critical: 0, warning: 1 };

function agencyRows(input: BrandPeriodInput): DashboardSessionRow[] {
  // KPI agency chỉ tính trên ca của agency, loại cả BRAND_INHOUSE lẫn UNKNOWN
  // khỏi tử số và mẫu số (CLAUDE.md §9).
  return input.rows.filter((row) => row.ownership === 'AGENCY');
}

function buildBrandRow(input: BrandPeriodInput): PortfolioBrandRow {
  const agency = agencyRows(input);
  const { totals, excluded } = sumRows(agency);
  const attributed = agency.filter((row) => !row.hasUnallocated && row.gmv !== null);
  // Mẫu số là target của đúng những ca đã quy kết: so số của 10 ca với target
  // của 12 ca sẽ ra tỷ lệ thấp một cách vô lý (docs/05 §10.1).
  const target = sumTargets(attributed);
  const { totals: inhouseTotals } = sumRows(
    input.rows.filter((row) => row.ownership === 'BRAND_INHOUSE'),
  );

  const achievement = targetAchievement(totals.gmv, target);
  const unallocated = input.unallocatedGmv ?? new Decimal(0);

  return {
    brandId: input.brandId,
    brandName: input.brandName,
    gmv: totals.gmv === null ? 0 : totals.gmv.toNumber(),
    targetGmv: target === null ? null : target.toNumber(),
    unallocatedGmv: unallocated.toNumber(),
    gmvDisplay: formatMoney(totals.gmv),
    targetDisplay: formatMoney(target),
    achievement,
    achievementDisplay: formatPercent(achievement),
    sessions: agency.length,
    excludedSessions: excluded,
    liveHoursDisplay: formatDuration(totals.liveMinutes),
    gmvPerHourDisplay: formatMoney(gmvPerHour(totals)),
    aovDisplay: formatMoney(aov(totals)),
    unallocatedDisplay: unallocated.isZero() ? null : formatMoney(unallocated),
    inhouseGmvDisplay: formatMoney(inhouseTotals.gmv),
  };
}

function attentionFor(
  input: BrandPeriodInput,
  brandRow: PortfolioBrandRow,
  thresholds: AnalyticsThresholds,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const base = { brandId: input.brandId, brandName: input.brandName };

  const unknown = input.rows.filter((row) => row.ownership === 'UNKNOWN').length;
  if (unknown > 0) {
    items.push({
      ...base,
      severity: 'critical',
      headline: `${unknown} đoạn live chưa rõ ai vận hành`,
      detail: 'Chưa vào KPI nào cho tới khi Operation xác nhận agency hay brand tự live.',
      href: '/operations/ownership',
    });
  }

  if (brandRow.unallocatedGmv > 0) {
    items.push({
      ...base,
      severity: 'critical',
      headline: `${brandRow.unallocatedDisplay} chưa quy kết được`,
      detail:
        brandRow.excludedSessions > 0
          ? `Thiếu report ở ranh giới bàn giao, ${brandRow.excludedSessions} ca không nằm trong GMV ở trên.`
          : 'Thiếu report ở ranh giới bàn giao.',
      href: '/operations',
    });
  }

  const pending = input.rows.filter((row) => row.status === 'DATA_PENDING').length;
  if (pending > 0) {
    items.push({
      ...base,
      severity: 'warning',
      headline: `${pending} ca chờ dữ liệu`,
      detail: 'Trợ live chưa nộp report, số của kỳ này còn thiếu.',
      href: '/operations',
    });
  }

  // Không đặt target thì không có gì để so — im lặng, không báo "0%".
  if (brandRow.achievement !== null && brandRow.achievement < thresholds.targetWarningPercent) {
    items.push({
      ...base,
      severity: 'warning',
      headline: `Đạt ${brandRow.achievementDisplay} target`,
      detail: `Còn thiếu ${formatMoney(
        new Decimal(brandRow.targetGmv ?? 0).minus(brandRow.gmv).abs(),
      )} so với target của ${brandRow.sessions - brandRow.excludedSessions} ca đã quy kết.`,
      href: '/dashboard',
    });
  }

  const total = input.rows.length;
  const high = input.rows.filter((row) => row.confidence === 'HIGH').length;
  const highShare = total === 0 ? null : (high / total) * 100;
  if (highShare !== null && highShare < thresholds.confidenceWarningPercent) {
    items.push({
      ...base,
      severity: 'critical',
      headline: `Chỉ ${formatPercent(highShare)} số ca có dữ liệu tin cậy`,
      detail: 'Mọi con số của brand này đang đứng trên nền dữ liệu yếu.',
      href: '/dashboard',
    });
  }

  return items;
}

export function buildPortfolio(
  inputs: BrandPeriodInput[],
  periodLabel: string,
  thresholds: AnalyticsThresholds = DEFAULT_THRESHOLDS,
): Portfolio {
  const brands = inputs.map(buildBrandRow).sort((a, b) => b.gmv - a.gmv);

  // Gộp bằng cách cộng các trường gốc của mọi ca rồi chia lại một lần, không
  // lấy trung bình của các tỷ lệ từng brand (CLAUDE.md §8).
  const allAgency = inputs.flatMap(agencyRows);
  const { totals, excluded } = sumRows(allAgency);
  const target = sumTargets(allAgency.filter((row) => !row.hasUnallocated && row.gmv !== null));

  const unallocated = inputs.reduce<Decimal>(
    (sum, input) => sum.plus(input.unallocatedGmv ?? new Decimal(0)),
    new Decimal(0),
  );

  const brandsOffTarget = brands.filter(
    (brand) => brand.achievement !== null && brand.achievement < thresholds.targetWarningPercent,
  ).length;

  return {
    periodLabel,
    brandCount: inputs.length,
    singleBrand: inputs.length <= 1,
    gmvDisplay: formatMoney(totals.gmv),
    excludedSessions: excluded,
    unallocatedDisplay: unallocated.isZero() ? null : formatMoney(unallocated),
    tiles: [
      {
        label: 'Đạt target',
        value: formatPercent(targetAchievement(totals.gmv, target)),
        caveat:
          target === null
            ? 'Chưa brand nào đặt target'
            : `Chênh lệch ${formatMoney(targetGap(totals.gmv, target))}`,
      },
      {
        label: 'Brand dưới ngưỡng',
        value: `${brandsOffTarget}/${brands.filter((brand) => brand.achievement !== null).length}`,
        caveat: `Ngưỡng đang đặt ở ${formatPercent(thresholds.targetWarningPercent)}`,
      },
      {
        label: 'Số ca',
        value: String(allAgency.length),
        caveat: excluded === 0 ? null : `${excluded} ca chưa quy kết được`,
      },
      { label: 'Giờ live', value: formatDuration(totals.liveMinutes), caveat: null },
      { label: 'GMV / giờ', value: formatMoney(gmvPerHour(totals)), caveat: null },
      {
        label: 'Đơn',
        value: totals.orders === null ? NOT_AVAILABLE : String(totals.orders),
        caveat: null,
      },
    ],
    brands,
    attention: inputs
      .flatMap((input) => {
        const brandRow = brands.find((brand) => brand.brandId === input.brandId)!;
        return attentionFor(input, brandRow, thresholds);
      })
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
  };
}
