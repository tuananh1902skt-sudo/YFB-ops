import { Decimal } from 'decimal.js';
import { toPlatformDateString } from '../parsing/primitives';
import type { StaffNeed } from './types';

export class PlanningError extends Error {}

export interface SessionFormInput {
  brandId: string;
  platformAccountId: string;
  campaignId?: string | null;
  plannedStartAt: Date;
  plannedEndAt: Date;
  targetGmv?: string | null;
  targetOrders?: number | null;
  note?: string | null;
  staffNeeds?: StaffNeed[];
}

export interface PreparedSession {
  brandId: string;
  platformAccountId: string;
  campaignId: string | null;
  /** Day the shift begins in GMT+7, even when it ends after midnight. */
  sessionDate: string;
  plannedStartAt: Date;
  plannedEndAt: Date;
  targetGmv: string | null;
  targetOrders: number | null;
  note: string | null;
  staffNeeds: StaffNeed[];
  warnings: string[];
}

/** Hours are per contract rather than picked from fixed slots, so only the
 *  obviously wrong is refused — but a suspicious length is still flagged. */
const LONG_SHIFT_HOURS = 12;
const MAX_SHIFT_HOURS = 24;

export function prepareSession(input: SessionFormInput): PreparedSession {
  if (input.plannedEndAt.getTime() <= input.plannedStartAt.getTime()) {
    throw new PlanningError('Giờ kết thúc phải sau giờ bắt đầu.');
  }

  const hours =
    (input.plannedEndAt.getTime() - input.plannedStartAt.getTime()) / (60 * 60 * 1000);
  if (hours > MAX_SHIFT_HOURS) {
    throw new PlanningError('Một ca không thể dài hơn 24 tiếng. Tách thành nhiều ca.');
  }

  const warnings: string[] = [];
  if (hours > LONG_SHIFT_HOURS) {
    warnings.push(`Ca dài ${hours.toFixed(1)} tiếng — kiểm tra lại giờ nhập.`);
  }

  if (input.targetGmv !== null && input.targetGmv !== undefined) {
    const target = new Decimal(input.targetGmv);
    if (target.isNegative()) throw new PlanningError('Target GMV không thể âm.');
  }

  for (const need of input.staffNeeds ?? []) {
    if (need.headcount < 1) {
      throw new PlanningError('Số người cần cho mỗi vai trò phải từ 1 trở lên.');
    }
  }

  return {
    brandId: input.brandId,
    platformAccountId: input.platformAccountId,
    campaignId: input.campaignId ?? null,
    // A shift running 20:00 → 00:30 belongs to the day it started. Splitting it
    // by calendar day would break every daily comparison (docs/01 §12).
    sessionDate: toPlatformDateString(input.plannedStartAt),
    plannedStartAt: input.plannedStartAt,
    plannedEndAt: input.plannedEndAt,
    targetGmv: input.targetGmv ?? null,
    targetOrders: input.targetOrders ?? null,
    note: input.note ?? null,
    staffNeeds: input.staffNeeds ?? [],
    warnings,
  };
}
