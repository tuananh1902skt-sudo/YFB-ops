import type { SupabaseClient } from '@supabase/supabase-js';
import { platformToday } from '../planning/schedule-view';
import { recommendTarget } from './recommend';
import { readTargetSettings } from './settings';
import type { FactorInput, HistoricalShift, TargetRecommendation } from './types';

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Lịch sử dùng để dựng baseline.
 *
 * Chỉ lấy ca `AGENCY` đã có kết quả và **không** dùng chung đoạn live: ca dùng
 * chung không có con số riêng, đưa vào baseline sẽ kéo lệch mà không ai thấy
 * (docs/05 §10.1).
 */
export async function loadTargetRecommendation(
  supabase: SupabaseClient,
  brandId: string,
  input: FactorInput,
  now: Date = new Date(),
): Promise<TargetRecommendation> {
  const settings = await supabase.from('system_settings').select('key,value');
  fail('đọc ngưỡng hệ thống', settings.error);
  const thresholds = readTargetSettings(
    Object.fromEntries((settings.data ?? []).map((row) => [row.key, row.value])),
  );

  const today = platformToday(now);
  const from = new Date(now.getTime() - thresholds.historyWindowDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const sessions = await supabase
    .from('live_sessions')
    .select(
      'id,session_date,campaigns(campaign_types(code)),live_session_staff(role_in_session,users(full_name))',
    )
    .eq('brand_id', brandId)
    .eq('ownership', 'AGENCY')
    .neq('status', 'CANCELLED')
    .gte('session_date', from)
    .lte('session_date', today);
  fail('đọc lịch sử ca', sessions.error);

  const ids = (sessions.data ?? []).map((row) => row.id as string);
  const results = ids.length
    ? await supabase
        .from('session_results')
        .select('session_id,gmv::text,live_minutes,has_unallocated')
        .in('session_id', ids)
    : { data: [], error: null };
  fail('đọc kết quả ca', results.error);

  const byId = new Map(
    ((results.data ?? []) as Record<string, unknown>[]).map((row) => [row.session_id as string, row]),
  );

  const history: HistoricalShift[] = [];
  for (const row of sessions.data ?? []) {
    const result = byId.get(row.id as string);
    if (!result || result.has_unallocated || result.gmv === null || result.live_minutes === null) {
      continue;
    }

    const staff = (Array.isArray(row.live_session_staff) ? row.live_session_staff : []) as {
      role_in_session: string;
      users: { full_name: string } | { full_name: string }[] | null;
    }[];
    const campaign = first(row.campaigns as Record<string, unknown> | Record<string, unknown>[] | null);
    const campaignType = campaign
      ? first(campaign.campaign_types as { code: string } | { code: string }[] | null)
      : null;

    history.push({
      sessionId: row.id as string,
      sessionDate: row.session_date as string,
      campaignTypeCode: campaignType?.code ?? null,
      hostNames: staff
        .filter((item) => item.role_in_session === 'HOST')
        .map((item) => first(item.users)?.full_name)
        .filter((value): value is string => Boolean(value)),
      gmv: result.gmv as string,
      liveMinutes: Number(result.live_minutes),
    });
  }

  return recommendTarget(history, input, today, thresholds);
}
