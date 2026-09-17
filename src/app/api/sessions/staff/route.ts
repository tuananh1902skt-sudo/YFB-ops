import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ScheduleConflictError, assignStaff, unassignStaff } from '@/lib/planning/assign';
import { PlanningError } from '@/lib/planning/session-form';
import { createAssignmentRepository } from '@/lib/supabase/planning-repository';
import { createServiceClient } from '@/lib/supabase/service';
import { createUserClient } from '@/lib/supabase/server';

const assignSchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(['HOST', 'ASSISTANT']),
  overrideReason: z.string().max(1000).nullish(),
});

const unassignSchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(['HOST', 'ASSISTANT']),
  reason: z.string().min(1).max(1000),
});

function errorResponse(error: unknown): NextResponse {
  if (error instanceof ScheduleConflictError) {
    // 409, with the clashing shifts, so the screen can offer to go ahead
    // rather than leaving the person to work out what went wrong.
    return NextResponse.json(
      {
        error: error.message,
        conflicts: error.conflicts.map((conflict) => ({
          sessionId: conflict.sessionId,
          label: conflict.sessionLabel,
        })),
      },
      { status: 409 },
    );
  }
  if (error instanceof PlanningError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: 'Thiếu thông tin phân ca.' }, { status: 400 });
  }
  console.error('[sessions/staff]', error);
  return NextResponse.json({ error: 'Chưa phân ca được. Thử lại sau.' }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const user = await createUserClient();
    const { data: auth } = await user.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: 'Cần đăng nhập.' }, { status: 401 });

    const body = assignSchema.parse(await request.json());
    const result = await assignStaff(createAssignmentRepository(user, createServiceClient()), {
      ...body,
      actorId: auth.user.id,
    });

    return NextResponse.json({ assigned: true, acceptedConflicts: result.conflicts.length });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await createUserClient();
    const { data: auth } = await user.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: 'Cần đăng nhập.' }, { status: 401 });

    const body = unassignSchema.parse(await request.json());
    await unassignStaff(createAssignmentRepository(user, createServiceClient()), {
      ...body,
      actorId: auth.user.id,
    });

    return NextResponse.json({ removed: true });
  } catch (error) {
    return errorResponse(error);
  }
}
