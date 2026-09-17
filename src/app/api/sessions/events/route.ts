import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SessionEventError } from '@/lib/sessions/events';
import { logSessionEvent } from '@/lib/sessions/log-event';
import { createSessionEventRepository } from '@/lib/supabase/session-event-repository';
import { createServiceClient } from '@/lib/supabase/service';
import { createUserClient } from '@/lib/supabase/server';

const schema = z.object({
  sessionId: z.string().uuid(),
  eventType: z.enum([
    'SESSION_STARTED',
    'SESSION_ENDED',
    'HANDOVER_AGENCY_TEAM',
    'HANDOVER_TO_INHOUSE',
    'HANDOVER_FROM_INHOUSE',
    'HOST_CHANGED',
    'ASSISTANT_CHANGED',
    'OVERTIME_EXTENDED',
    'ENDED_EARLY',
    'RESTART_TECHNICAL',
    'RESTART_STRATEGIC',
  ]),
  occurredAt: z.iso.datetime(),
  roomId: z.string().uuid().nullish(),
  relatedSessionId: z.string().uuid().nullish(),
  fromUserId: z.string().uuid().nullish(),
  toUserId: z.string().uuid().nullish(),
  reason: z.string().max(1000).nullish(),
});

export async function POST(request: Request) {
  try {
    const user = await createUserClient();
    const { data: auth } = await user.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
    }

    const body = schema.parse(await request.json());
    const result = await logSessionEvent(
      createSessionEventRepository(user, createServiceClient()),
      { ...body, occurredAt: new Date(body.occurredAt) },
      auth.user.id,
    );

    return NextResponse.json({
      eventId: result.eventId,
      movedBoundaries: result.timePatches.length,
    });
  } catch (error) {
    if (error instanceof SessionEventError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc của sự kiện.' }, { status: 400 });
    }
    console.error('[sessions/events]', error);
    return NextResponse.json(
      { error: 'Chưa ghi được sự kiện. Thử lại, hoặc báo Operation.' },
      { status: 500 },
    );
  }
}
