import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ParseError } from '@/lib/parsing/primitives';
import { createServiceClient } from '@/lib/supabase/service';
import { createUserClient } from '@/lib/supabase/server';
import type { UploadClients } from '@/lib/ingest/live-upload-service';

export class NotSignedIn extends Error {}

export async function requireUploadClients(): Promise<UploadClients> {
  const user = await createUserClient();
  const { data, error } = await user.auth.getUser();
  if (error || !data.user) throw new NotSignedIn();

  return { user, service: createServiceClient(), userId: data.user.id };
}

/**
 * Users never see a stack trace or a Postgres error code (docs/06 §7), but the
 * message still has to say what actually went wrong — a dead end with no reason
 * is what sends people back to the spreadsheet.
 */
export function uploadErrorResponse(error: unknown): NextResponse {
  if (error instanceof NotSignedIn) {
    return NextResponse.json({ error: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để nộp dữ liệu.' }, { status: 401 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Thiếu thông tin ca hoặc file cần nộp.' }, { status: 400 });
  }
  if (error instanceof ParseError) {
    return NextResponse.json({ error: `Không đọc được file: ${error.message}` }, { status: 400 });
  }

  console.error('[imports/live]', error);
  return NextResponse.json(
    { error: 'Hệ thống chưa xử lý được file này. Báo Operation kèm tên file để kiểm tra.' },
    { status: 500 },
  );
}
