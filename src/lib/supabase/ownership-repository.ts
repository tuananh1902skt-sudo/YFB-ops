import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionOwnership } from '../attribution/types';
import { recomputeWindow } from '../ingest/recompute';
import type { AuditEntry } from '../ingest/types';
import type { OwnershipRepository, OwnershipSession } from '../operations/ownership';
import { createIngestRepository } from './ingest-repository';

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

/**
 * Ownership decisions go through the signed-in person's client, so the
 * `can_manage_brand` policy is what actually decides whether they may make one
 * — a host or assistant is refused by the database, not only by the screen
 * (docs/07 §D3).
 */
export function createOwnershipRepository(
  user: SupabaseClient,
  service: SupabaseClient,
): OwnershipRepository {
  return {
    async getSession(sessionId): Promise<OwnershipSession | null> {
      const { data, error } = await user
        .from('live_sessions')
        .select(
          'id,platform_account_id,brand_id,ownership,status,planned_start_at,planned_end_at,actual_start_at,actual_end_at',
        )
        .eq('id', sessionId)
        .maybeSingle();
      fail('đọc ca', error);
      if (!data) return null;

      const startAt = data.actual_start_at ?? data.planned_start_at;
      const endAt = data.actual_end_at ?? data.planned_end_at;
      if (!startAt || !endAt) {
        throw new Error('Ca này chưa có khung giờ, không xử lý ownership được.');
      }

      return {
        id: data.id,
        platformAccountId: data.platform_account_id,
        brandId: data.brand_id,
        ownership: data.ownership,
        status: data.status,
        startAt: new Date(startAt),
        endAt: new Date(endAt),
      };
    },

    async setOwnership(sessionId: string, ownership: SessionOwnership, actorId: string) {
      const { error } = await user
        .from('live_sessions')
        .update({
          ownership,
          ownership_confirmed_by: actorId,
          ownership_confirmed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
      fail('cập nhật ownership', error);
    },

    async extendSessionWindow(sessionId: string, startAt: Date, endAt: Date) {
      // Only the actual window moves. The planned window is what was agreed and
      // is what "off sớm" and "OT" are measured against (docs/01 §4).
      const { error } = await user
        .from('live_sessions')
        .update({
          actual_start_at: startAt.toISOString(),
          actual_end_at: endAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
      fail('mở rộng khung giờ ca', error);
    },

    async cancelSession(sessionId: string, note: string) {
      const { error } = await user
        .from('live_sessions')
        .update({ status: 'CANCELLED', note, updated_at: new Date().toISOString() })
        .eq('id', sessionId);
      fail('huỷ ca tạm', error);
    },

    async supersedeAttributions(sessionIds: string[]) {
      if (sessionIds.length === 0) return;
      const { error } = await service
        .from('session_attributions')
        .update({ is_current: false })
        .in('session_id', sessionIds)
        .eq('is_current', true);
      fail('đánh dấu kết quả cũ', error);
    },

    async writeAuditLogs(entries: AuditEntry[]) {
      await createIngestRepository({ user, service }).writeAuditLogs(entries);
    },

    async recompute(platformAccountId: string, from: Date, to: Date) {
      await recomputeWindow(createIngestRepository({ user, service }), platformAccountId, from, to);
    },
  };
}
