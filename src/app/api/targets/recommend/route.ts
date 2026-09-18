import { NextResponse } from 'next/server';
import { z } from 'zod';
import { toSuggestionView } from '@/lib/targets/presentation';
import { loadTargetRecommendation } from '@/lib/targets/load';
import { createUserClient } from '@/lib/supabase/server';

const schema = z.object({
  brandId: z.string().uuid(),
  plannedStartAt: z.iso.datetime(),
  plannedEndAt: z.iso.datetime(),
  campaignTypeCode: z.string().max(40).nullish(),
  hostNames: z.array(z.string().max(200)).max(10).optional(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createUserClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: 'Cần đăng nhập.' }, { status: 401 });

    const body = schema.parse(await request.json());
    const hours =
      (new Date(body.plannedEndAt).getTime() - new Date(body.plannedStartAt).getTime()) / 3_600_000;

    // Đọc qua client của người đăng nhập, nên RLS quyết định họ có được xem lịch
    // sử của brand này hay không — route không tự kiểm tra lấy.
    const recommendation = await loadTargetRecommendation(supabase, body.brandId, {
      plannedHours: hours,
      campaignTypeCode: body.campaignTypeCode ?? null,
      hostNames: body.hostNames ?? [],
    });

    return NextResponse.json({ suggestion: toSuggestionView(recommendation) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Thiếu thông tin để tính đề xuất.' }, { status: 400 });
    }
    console.error('[targets/recommend]', error);
    return NextResponse.json({ error: 'Chưa tính được đề xuất.' }, { status: 500 });
  }
}
