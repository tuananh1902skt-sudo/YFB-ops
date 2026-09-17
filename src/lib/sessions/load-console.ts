import type { SupabaseClient } from '@supabase/supabase-js';
import { formatDate, formatMoney, formatTimeRange } from '../format';
import type { LiveConsoleData } from './console-view';
import type { SessionEventType } from './events';

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Shifts the same day on the same account, offered as handover targets. */
const HANDOVER_WINDOW_HOURS = 12;

export async function loadLiveConsole(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<LiveConsoleData | null> {
  const { data, error } = await supabase
    .from('live_sessions')
    .select(
      'id,brand_id,platform_account_id,session_date,status,target_gmv::text,planned_start_at,planned_end_at,actual_start_at,actual_end_at,brands(name),live_session_staff(role_in_session,users(full_name))',
    )
    .eq('id', sessionId)
    .maybeSingle();
  fail('đọc ca', error);
  if (!data) return null;

  const staff = (Array.isArray(data.live_session_staff) ? data.live_session_staff : []) as {
    role_in_session: string;
    users: { full_name: string } | { full_name: string }[] | null;
  }[];

  const events = await supabase
    .from('session_events')
    .select('id,event_type,occurred_at,reason,users:created_by(full_name)')
    .eq('session_id', sessionId)
    .order('occurred_at', { ascending: true });
  fail('đọc diễn biến ca', events.error);

  const rooms = await supabase
    .from('room_snapshots')
    .select('platform_rooms!inner(platform_room_id,platform_account_id)')
    .eq('platform_rooms.platform_account_id', data.platform_account_id)
    .order('snapshot_end_at', { ascending: false })
    .limit(1);
  fail('đọc phòng live gần nhất', rooms.error);

  const startAt = new Date(data.actual_start_at ?? data.planned_start_at);
  const endAt = new Date(data.actual_end_at ?? data.planned_end_at);
  const windowMs = HANDOVER_WINDOW_HOURS * 60 * 60 * 1000;

  const candidates = await supabase
    .from('live_sessions')
    .select('id,planned_start_at,planned_end_at,live_session_staff(role_in_session,users(full_name))')
    .eq('platform_account_id', data.platform_account_id)
    .neq('id', sessionId)
    .neq('status', 'CANCELLED')
    .neq('ownership', 'UNKNOWN')
    .gte('planned_start_at', new Date(startAt.getTime() - windowMs).toISOString())
    .lte('planned_start_at', new Date(endAt.getTime() + windowMs).toISOString())
    .order('planned_start_at');
  fail('đọc ca có thể bàn giao', candidates.error);

  return {
    sessionId: data.id,
    brandName: first(data.brands as { name: string } | { name: string }[] | null)?.name ?? '',
    shiftLabel: `Ca ${formatDate(new Date(`${data.session_date}T00:00:00+07:00`))} · ${formatTimeRange(startAt, endAt)}`,
    status: data.status,
    startedAt: data.actual_start_at ?? data.planned_start_at,
    plannedEndAt: data.planned_end_at,
    hostNames: staff
      .filter((item) => item.role_in_session === 'HOST')
      .map((item) => first(item.users)?.full_name ?? '')
      .filter(Boolean),
    assistantNames: staff
      .filter((item) => item.role_in_session === 'ASSISTANT')
      .map((item) => first(item.users)?.full_name ?? '')
      .filter(Boolean),
    platformRoomId:
      first(
        (rooms.data?.[0] as { platform_rooms?: { platform_room_id: string } } | undefined)
          ?.platform_rooms ?? null,
      )?.platform_room_id ?? null,
    targetGmvDisplay: data.target_gmv === null ? null : formatMoney(data.target_gmv),
    events: (events.data ?? []).map((row) => ({
      id: row.id,
      eventType: row.event_type as SessionEventType,
      occurredAt: row.occurred_at,
      reason: row.reason,
      actorName: first(row.users as { full_name: string } | { full_name: string }[] | null)?.full_name ?? null,
    })),
    handoverTargets: (candidates.data ?? []).map((row) => {
      const hosts = (Array.isArray(row.live_session_staff) ? row.live_session_staff : []) as {
        role_in_session: string;
        users: { full_name: string } | { full_name: string }[] | null;
      }[];
      const names = hosts
        .filter((item) => item.role_in_session === 'HOST')
        .map((item) => first(item.users)?.full_name)
        .filter((value): value is string => Boolean(value));

      return {
        sessionId: row.id,
        label: `${formatTimeRange(new Date(row.planned_start_at), new Date(row.planned_end_at))}${
          names.length > 0 ? ` · ${names.join(', ')}` : ''
        }`,
      };
    }),
  };
}
