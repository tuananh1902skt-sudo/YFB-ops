import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PlanningError, prepareSession } from '@/lib/planning/session-form';
import { insertSession, updateSessionPlan } from '@/lib/supabase/planning-repository';
import { createUserClient } from '@/lib/supabase/server';

const staffNeed = z.object({
  role: z.enum(['HOST', 'ASSISTANT']),
  headcount: z.number().int().min(1).max(10),
});

const base = {
  brandId: z.string().uuid(),
  platformAccountId: z.string().uuid(),
  campaignId: z.string().uuid().nullish(),
  // Hours are typed in freely rather than picked from fixed slots: each brand's
  // contract drives a different schedule (docs/06 §B3).
  plannedStartAt: z.iso.datetime(),
  plannedEndAt: z.iso.datetime(),
  targetGmv: z.string().regex(/^\d+(\.\d{1,2})?$/).nullish(),
  targetOrders: z.number().int().min(0).nullish(),
  note: z.string().max(2000).nullish(),
  staffNeeds: z.array(staffNeed).max(10).optional(),
};

const createSchema = z.object(base);
const updateSchema = z.object({ ...base, sessionId: z.string().uuid() });

function toPrepared(body: z.infer<typeof createSchema>) {
  return prepareSession({
    ...body,
    campaignId: body.campaignId ?? null,
    plannedStartAt: new Date(body.plannedStartAt),
    plannedEndAt: new Date(body.plannedEndAt),
    targetGmv: body.targetGmv ?? null,
    targetOrders: body.targetOrders ?? null,
    note: body.note ?? null,
  });
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof PlanningError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: 'Thiếu thông tin bắt buộc của ca.' }, { status: 400 });
  }
  console.error('[sessions]', error);
  return NextResponse.json({ error: 'Chưa lưu được ca. Thử lại sau.' }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const supabase = await createUserClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: 'Cần đăng nhập.' }, { status: 401 });

    const prepared = toPrepared(createSchema.parse(await request.json()));
    const sessionId = await insertSession(supabase, prepared, auth.user.id);

    return NextResponse.json({ sessionId, warnings: prepared.warnings });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createUserClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: 'Cần đăng nhập.' }, { status: 401 });

    const body = updateSchema.parse(await request.json());
    const prepared = toPrepared(body);
    await updateSessionPlan(supabase, body.sessionId, prepared);

    return NextResponse.json({ sessionId: body.sessionId, warnings: prepared.warnings });
  } catch (error) {
    return errorResponse(error);
  }
}
