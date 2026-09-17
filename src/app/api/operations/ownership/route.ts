import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  OwnershipDecisionError,
  confirmAgencyShift,
  confirmBrandInhouse,
  mergeIntoSession,
} from '@/lib/operations/ownership';
import { createOwnershipRepository } from '@/lib/supabase/ownership-repository';
import { createServiceClient } from '@/lib/supabase/service';
import { createUserClient } from '@/lib/supabase/server';

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('BRAND_INHOUSE'),
    sessionIds: z.array(z.string().uuid()).min(1).max(100),
    reason: z.string().min(1),
  }),
  z.object({
    action: z.literal('AGENCY'),
    sessionIds: z.array(z.string().uuid()).min(1).max(100),
    reason: z.string().min(1),
  }),
  z.object({
    action: z.literal('MERGE'),
    sessionIds: z.array(z.string().uuid()).length(1),
    targetSessionId: z.string().uuid(),
    reason: z.string().min(1),
  }),
]);

export async function POST(request: Request) {
  try {
    const user = await createUserClient();
    const { data: auth } = await user.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
    }

    const body = schema.parse(await request.json());
    const repo = createOwnershipRepository(user, createServiceClient());

    if (body.action === 'MERGE') {
      await mergeIntoSession(
        repo,
        body.sessionIds[0],
        body.targetSessionId,
        body.reason,
        auth.user.id,
      );
      return NextResponse.json({ handled: 1 });
    }

    // Bulk decisions share one reason, and each one still writes its own audit
    // entry — a batch must stay as traceable as a single decision.
    const decide = body.action === 'AGENCY' ? confirmAgencyShift : confirmBrandInhouse;
    for (const sessionId of body.sessionIds) {
      await decide(repo, sessionId, body.reason, auth.user.id);
    }
    return NextResponse.json({ handled: body.sessionIds.length });
  } catch (error) {
    if (error instanceof OwnershipDecisionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Thiếu lý do hoặc chưa chọn ca nào.' }, { status: 400 });
    }
    console.error('[operations/ownership]', error);
    return NextResponse.json(
      { error: 'Chưa xử lý được. Thử lại, hoặc báo quản trị hệ thống.' },
      { status: 500 },
    );
  }
}
