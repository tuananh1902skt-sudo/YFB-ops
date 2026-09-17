import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScheduleSessionInput } from './schedule-view';
import { weekDates } from './schedule-view';

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export interface StaffOption {
  userId: string;
  name: string;
}

export async function loadWeek(
  supabase: SupabaseClient,
  anchor: string,
): Promise<ScheduleSessionInput[]> {
  const week = weekDates(anchor);

  const { data, error } = await supabase
    .from('live_sessions')
    .select(
      'id,session_date,status,ownership,planned_start_at,planned_end_at,target_gmv::text,brands(name),live_session_staff(role_in_session,users(full_name)),shift_slots(role_needed,headcount)',
    )
    .gte('session_date', week[0])
    .lte('session_date', week[6])
    .order('planned_start_at');
  fail('đọc lịch live', error);

  return (data ?? []).map((row) => {
    const staff = (Array.isArray(row.live_session_staff) ? row.live_session_staff : []) as {
      role_in_session: 'HOST' | 'ASSISTANT';
      users: { full_name: string } | { full_name: string }[] | null;
    }[];
    const slots = (Array.isArray(row.shift_slots) ? row.shift_slots : []) as {
      role_needed: 'HOST' | 'ASSISTANT';
      headcount: number;
    }[];

    const names = (role: 'HOST' | 'ASSISTANT') =>
      staff
        .filter((item) => item.role_in_session === role)
        .map((item) => first(item.users)?.full_name)
        .filter((value): value is string => Boolean(value));

    return {
      sessionId: row.id,
      brandName: first(row.brands as { name: string } | { name: string }[] | null)?.name ?? '',
      sessionDate: row.session_date,
      status: row.status,
      ownership: row.ownership,
      plannedStartAt: row.planned_start_at,
      plannedEndAt: row.planned_end_at,
      targetGmv: row.target_gmv,
      hostNames: names('HOST'),
      assistantNames: names('ASSISTANT'),
      needs: slots.map((slot) => ({ role: slot.role_needed, headcount: slot.headcount })),
    } satisfies ScheduleSessionInput;
  });
}

/** People who can be put on a shift for this brand, for the assignment picker. */
export async function loadStaffOptions(
  supabase: SupabaseClient,
  brandId: string,
): Promise<StaffOption[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('user_id,users(full_name)')
    .in('role', ['HOST', 'ASSISTANT'])
    .or(`brand_id.eq.${brandId},brand_id.is.null`);
  fail('đọc danh sách nhân sự', error);

  const options = new Map<string, string>();
  for (const row of data ?? []) {
    const name = first(row.users as { full_name: string } | { full_name: string }[] | null)?.full_name;
    if (name) options.set(row.user_id as string, name);
  }

  return [...options].map(([userId, name]) => ({ userId, name })).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}
