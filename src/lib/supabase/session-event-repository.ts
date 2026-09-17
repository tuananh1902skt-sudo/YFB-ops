import type { SupabaseClient } from '@supabase/supabase-js';
import { recomputeWindow } from '../ingest/recompute';
import type { SessionEventInput, SessionTimePatch } from '../sessions/events';
import type { EventSession, SessionEventRepository } from '../sessions/log-event';
import { createIngestRepository } from './ingest-repository';

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

/**
 * Events are written through the signed-in person's client: the policy already
 * says only someone assigned to the shift (or Operation) may log on it, and the
 * database enforces `created_by = auth.uid()`.
 *
 * The recompute that follows uses the service client, because deriving figures
 * is the engine's job rather than the person's.
 */
export function createSessionEventRepository(
  user: SupabaseClient,
  service: SupabaseClient,
): SessionEventRepository {
  return {
    async getSession(sessionId): Promise<EventSession | null> {
      const { data, error } = await user
        .from('live_sessions')
        .select(
          'id,platform_account_id,actual_start_at,actual_end_at,planned_start_at,planned_end_at',
        )
        .eq('id', sessionId)
        .maybeSingle();
      fail('đọc ca', error);
      if (!data) return null;

      return {
        id: data.id,
        platformAccountId: data.platform_account_id,
        actualStartAt: data.actual_start_at ? new Date(data.actual_start_at) : null,
        actualEndAt: data.actual_end_at ? new Date(data.actual_end_at) : null,
        plannedStartAt: data.planned_start_at ? new Date(data.planned_start_at) : null,
        plannedEndAt: data.planned_end_at ? new Date(data.planned_end_at) : null,
      };
    },

    async insertEvent(event: SessionEventInput, createdBy: string): Promise<string> {
      const { data, error } = await user
        .from('session_events')
        .insert({
          session_id: event.sessionId,
          event_type: event.eventType,
          occurred_at: event.occurredAt.toISOString(),
          room_id: event.roomId ?? null,
          related_session_id: event.relatedSessionId ?? null,
          from_user_id: event.fromUserId ?? null,
          to_user_id: event.toUserId ?? null,
          reason: event.reason ?? null,
          created_by: createdBy,
        })
        .select('id')
        .single();
      fail('ghi sự kiện ca', error);
      return data!.id as string;
    },

    async patchSessionTimes(patches: SessionTimePatch[]): Promise<void> {
      for (const patch of patches) {
        const update: Record<string, string> = { updated_at: new Date().toISOString() };
        if (patch.actualStartAt) update.actual_start_at = patch.actualStartAt.toISOString();
        if (patch.actualEndAt) update.actual_end_at = patch.actualEndAt.toISOString();

        // Through the service client: an assistant may log what happened, but
        // updating the shift row itself is Operation's policy (docs/07 §D3).
        const { error } = await service
          .from('live_sessions')
          .update(update)
          .eq('id', patch.sessionId);
        fail('cập nhật mốc thời gian thực tế', error);
      }
    },

    async recompute(platformAccountId: string, from: Date, to: Date): Promise<void> {
      await recomputeWindow(createIngestRepository({ user, service }), platformAccountId, from, to);
    },
  };
}
