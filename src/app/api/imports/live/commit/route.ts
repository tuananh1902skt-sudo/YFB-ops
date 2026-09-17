import { NextResponse } from 'next/server';
import { z } from 'zod';
import { commitUpload } from '@/lib/ingest/live-upload-service';
import { requireUploadClients, uploadErrorResponse } from '../shared';

const schema = z.object({
  platformAccountId: z.string().uuid(),
  fileName: z.string().min(1),
  // The path is derived from these server-side, so the browser cannot point the
  // import at someone else's file.
  fileHash: z.string().regex(/^[0-9a-f]{64}$/),
});

export async function POST(request: Request) {
  try {
    const clients = await requireUploadClients();
    const body = schema.parse(await request.json());
    return NextResponse.json(
      await commitUpload(clients, body.platformAccountId, body.fileName, body.fileHash),
    );
  } catch (error) {
    return uploadErrorResponse(error);
  }
}
