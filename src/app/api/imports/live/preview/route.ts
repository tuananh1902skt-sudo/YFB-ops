import { NextResponse } from 'next/server';
import { z } from 'zod';
import { previewUpload } from '@/lib/ingest/live-upload-service';
import { requireUploadClients, uploadErrorResponse } from '../shared';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const schema = z.object({
  platformAccountId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const clients = await requireUploadClients();
    const form = await request.formData();
    const { platformAccountId } = schema.parse({
      platformAccountId: form.get('platformAccountId'),
    });

    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Chưa chọn file để nộp.' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: 'File lớn hơn 25MB — nhiều khả năng không phải file report của TikTok Shop.' },
        { status: 400 },
      );
    }

    // Parsed on the server, never in the browser (CLAUDE.md §14).
    const buffer = Buffer.from(await file.arrayBuffer());
    return NextResponse.json(await previewUpload(clients, platformAccountId, file.name, buffer));
  } catch (error) {
    return uploadErrorResponse(error);
  }
}
