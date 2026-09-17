import { NextResponse } from 'next/server';
import { z } from 'zod';
import { IMPORT_BUCKET } from '@/lib/ingest/live-upload-service';
import { createUserClient } from '@/lib/supabase/server';

/** Long enough to open the file, short enough not to become a shared link. */
const SIGNED_URL_SECONDS = 300;

/**
 * Opens the report a figure came from.
 *
 * The path is read from the import row through the signed-in person's client,
 * so row level security decides whether they may see that brand's file — the
 * URL carries only an import id, never a storage path.
 */
export async function GET(_request: Request, context: { params: Promise<{ importId: string }> }) {
  const { importId } = await context.params;

  try {
    z.string().uuid().parse(importId);
    const supabase = await createUserClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('raw_imports')
      .select('storage_path,file_name')
      .eq('id', importId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: 'Không tìm thấy file của lần nộp này.' }, { status: 404 });
    }

    const signed = await supabase.storage
      .from(IMPORT_BUCKET)
      .createSignedUrl(data.storage_path, SIGNED_URL_SECONDS, { download: data.file_name });
    if (signed.error) throw new Error(signed.error.message);

    return NextResponse.redirect(signed.data.signedUrl);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Mã lần nộp không hợp lệ.' }, { status: 400 });
    }
    console.error('[imports/file]', error);
    return NextResponse.json({ error: 'Chưa mở được file gốc.' }, { status: 500 });
  }
}
