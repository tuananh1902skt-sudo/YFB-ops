import type { SupabaseClient } from '@supabase/supabase-js';
import { createIngestRepository } from './ingest-repository';
import type { AuditEntry } from '../ingest/types';
import type { AssignableSession, AssignmentRepository } from '../planning/assign';
import type { Assignment } from '../planning/conflicts';
import type { PreparedSession } from '../planning/session-form';
import type { SessionStaffRole } from '../planning/types';

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Scheduling runs entirely through the signed-in person's client: `can_manage_brand`
 * is what decides who may create a shift or put someone on it.
 */
export function createAssignmentRepository(
  user: SupabaseClient,
  service: SupabaseClient,
): AssignmentRepository {
  return {
    async getSession(sessionId): Promise<AssignableSession | null> {
      const { data, error } = await user
        .from('live_sessions')
        .select('id,brand_id,status,planned_start_at,planned_end_at,actual_start_at,actual_end_at')
        .eq('id', sessionId)
        .maybeSingle();
      fail('đọc ca', error);
      if (!data) return null;

      const startAt = data.actual_start_at ?? data.planned_start_at;
      const endAt = data.actual_end_at ?? data.planned_end_at;
      if (!startAt || !endAt) throw new Error('Ca chưa có khung giờ.');

      return {
        id: data.id,
        brandId: data.brand_id,
        status: data.status,
        startAt: new Date(startAt),
        endAt: new Date(endAt),
      };
    },

    async listAssignmentsFor(userId, from, to): Promise<Assignment[]> {
      // Through the service client on purpose: a clash on another brand's shift
      // must still be reported, even to someone who cannot see that brand.
      // Only the hours and the shift's label are read, never its figures.
      const { data, error } = await service
        .from('live_session_staff')
        .select(
          'role_in_session,live_sessions!inner(id,status,planned_start_at,planned_end_at,actual_start_at,actual_end_at,brands(name))',
        )
        .eq('user_id', userId)
        .neq('live_sessions.status', 'CANCELLED')
        .gte('live_sessions.planned_start_at', new Date(from.getTime() - 86_400_000).toISOString())
        .lte('live_sessions.planned_start_at', new Date(to.getTime() + 86_400_000).toISOString());
      fail('đọc lịch của nhân sự', error);

      return (data ?? [])
        .map((row) => {
          const session = first(
            row.live_sessions as Record<string, unknown> | Record<string, unknown>[],
          ) as
            | {
                id: string;
                planned_start_at: string;
                planned_end_at: string;
                actual_start_at: string | null;
                actual_end_at: string | null;
                brands: { name: string } | { name: string }[] | null;
              }
            | null;
          if (!session) return null;

          const startAt = new Date(session.actual_start_at ?? session.planned_start_at);
          const endAt = new Date(session.actual_end_at ?? session.planned_end_at);
          const brand = first(session.brands)?.name ?? '';

          return {
            sessionId: session.id,
            sessionLabel: `${brand} ${startAt.toISOString().slice(11, 16)}`,
            role: row.role_in_session as SessionStaffRole,
            startAt,
            endAt,
          } satisfies Assignment;
        })
        .filter((assignment): assignment is Assignment => assignment !== null);
    },

    async addStaff(sessionId, userId, role) {
      const { error } = await user
        .from('live_session_staff')
        .insert({ session_id: sessionId, user_id: userId, role_in_session: role });
      fail('phân người vào ca', error);
    },

    async removeStaff(sessionId, userId, role) {
      const { error } = await user
        .from('live_session_staff')
        .delete()
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .eq('role_in_session', role);
      fail('gỡ người khỏi ca', error);
    },

    async writeAuditLogs(entries: AuditEntry[]) {
      await createIngestRepository({ user, service }).writeAuditLogs(entries);
    },
  };
}

export async function insertSession(
  user: SupabaseClient,
  prepared: PreparedSession,
  createdBy: string,
): Promise<string> {
  const { data, error } = await user
    .from('live_sessions')
    .insert({
      brand_id: prepared.brandId,
      platform_account_id: prepared.platformAccountId,
      campaign_id: prepared.campaignId,
      session_date: prepared.sessionDate,
      planned_start_at: prepared.plannedStartAt.toISOString(),
      planned_end_at: prepared.plannedEndAt.toISOString(),
      target_gmv: prepared.targetGmv,
      target_orders: prepared.targetOrders,
      target_source: prepared.targetGmv === null ? null : 'AGENCY',
      note: prepared.note,
      status: prepared.staffNeeds.length > 0 ? 'OPEN_FOR_BOOKING' : 'PLANNING',
      created_by: createdBy,
    })
    .select('id')
    .single();
  fail('tạo ca', error);

  const sessionId = data!.id as string;

  if (prepared.staffNeeds.length > 0) {
    const slots = await user.from('shift_slots').insert(
      prepared.staffNeeds.map((need) => ({
        session_id: sessionId,
        brand_id: prepared.brandId,
        role_needed: need.role,
        start_at: prepared.plannedStartAt.toISOString(),
        end_at: prepared.plannedEndAt.toISOString(),
        headcount: need.headcount,
        created_by: createdBy,
      })),
    );
    fail('tạo nhu cầu nhân sự', slots.error);
  }

  return sessionId;
}

export async function updateSessionPlan(
  user: SupabaseClient,
  sessionId: string,
  prepared: PreparedSession,
): Promise<void> {
  const { error } = await user
    .from('live_sessions')
    .update({
      campaign_id: prepared.campaignId,
      session_date: prepared.sessionDate,
      planned_start_at: prepared.plannedStartAt.toISOString(),
      planned_end_at: prepared.plannedEndAt.toISOString(),
      target_gmv: prepared.targetGmv,
      target_orders: prepared.targetOrders,
      note: prepared.note,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
  fail('cập nhật ca', error);
}
