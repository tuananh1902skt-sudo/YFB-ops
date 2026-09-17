import { NextResponse } from 'next/server';
import { z } from 'zod';
import { approveBooking, cancelOwnBooking, registerForSlot, rejectBooking } from '@/lib/planning/book';
import { ScheduleConflictError } from '@/lib/planning/assign';
import { PlanningError } from '@/lib/planning/session-form';
import { createBookingRepository } from '@/lib/supabase/booking-repository';
import { createServiceClient } from '@/lib/supabase/service';
import { createUserClient } from '@/lib/supabase/server';

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('REGISTER'),
    slotId: z.string().uuid(),
    note: z.string().max(500).nullish(),
  }),
  z.object({ action: z.literal('CANCEL'), slotId: z.string().uuid() }),
  z.object({
    action: z.literal('APPROVE'),
    slotId: z.string().uuid(),
    userId: z.string().uuid(),
    overrideReason: z.string().max(1000).nullish(),
  }),
  z.object({
    action: z.literal('REJECT'),
    slotId: z.string().uuid(),
    userId: z.string().uuid(),
    reason: z.string().min(1).max(1000),
  }),
]);

function errorResponse(error: unknown): NextResponse {
  if (error instanceof ScheduleConflictError) {
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
    return NextResponse.json({ error: 'Thiếu thông tin đăng ký.' }, { status: 400 });
  }
  console.error('[bookings]', error);
  return NextResponse.json({ error: 'Chưa xử lý được đăng ký. Thử lại sau.' }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const user = await createUserClient();
    const { data: auth } = await user.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: 'Cần đăng nhập.' }, { status: 401 });

    const body = schema.parse(await request.json());
    const repo = createBookingRepository(user, createServiceClient());

    switch (body.action) {
      case 'REGISTER': {
        // Registering is always for yourself: the id comes from the session,
        // never from the request body.
        const result = await registerForSlot(repo, body.slotId, auth.user.id, body.note ?? null);
        return NextResponse.json({
          registered: true,
          conflicts: result.conflicts.map((conflict) => ({
            sessionId: conflict.sessionId,
            label: conflict.sessionLabel,
          })),
        });
      }
      case 'CANCEL':
        await cancelOwnBooking(repo, body.slotId, auth.user.id);
        return NextResponse.json({ cancelled: true });
      case 'APPROVE': {
        const result = await approveBooking(repo, { ...body, actorId: auth.user.id });
        return NextResponse.json({ approved: true, sessionConfirmed: result.sessionConfirmed });
      }
      case 'REJECT':
        await rejectBooking(repo, { ...body, actorId: auth.user.id });
        return NextResponse.json({ rejected: true });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
