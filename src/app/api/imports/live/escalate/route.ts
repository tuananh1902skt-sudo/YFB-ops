import { NextResponse } from 'next/server';
import { z } from 'zod';
import { storagePathFor } from '@/lib/ingest/live-upload-service';
import { requireUploadClients, uploadErrorResponse } from '../shared';

const schema = z.object({
  platformAccountId: z.string().uuid(),
  fileName: z.string().min(1),
  fileHash: z.string().regex(/^[0-9a-f]{64}$/),
  note: z.string().max(1000).optional(),
});

/**
 * "Không khớp — báo Operation": the assistant's way out when the figures look
 * wrong. It never changes a number, it only puts the file in front of someone
 * who can decide — the shift is not held up waiting for that decision.
 */
export async function POST(request: Request) {
  try {
    const clients = await requireUploadClients();
    const body = schema.parse(await request.json());
    const storagePath = storagePathFor(body.platformAccountId, body.fileHash);

    const account = await clients.service
      .from('platform_accounts')
      .select('brand_id,account_name')
      .eq('id', body.platformAccountId)
      .single();
    if (account.error) throw new Error(account.error.message);

    const reviewers = await clients.service
      .from('user_roles')
      .select('user_id')
      .in('role', ['OPERATION', 'ACCOUNT', 'MANAGEMENT'])
      .or(`brand_id.eq.${account.data.brand_id},brand_id.is.null`);
    if (reviewers.error) throw new Error(reviewers.error.message);

    const recipients = [...new Set((reviewers.data ?? []).map((row) => row.user_id as string))];
    if (recipients.length > 0) {
      const notify = await clients.service.from('notifications').insert(
        recipients.map((userId) => ({
          user_id: userId,
          type: 'UPLOAD_MISMATCH_REPORTED',
          payload: {
            platformAccountId: body.platformAccountId,
            accountName: account.data.account_name,
            fileName: body.fileName,
            storagePath,
            note: body.note ?? null,
            reportedBy: clients.userId,
          },
        })),
      );
      if (notify.error) throw new Error(notify.error.message);
    }

    const audit = await clients.user.from('audit_logs').insert({
      entity_type: 'raw_import_file',
      entity_id: `${body.platformAccountId}:${body.fileHash}`,
      action: 'MISMATCH_REPORTED',
      after_data: { fileName: body.fileName, storagePath, note: body.note ?? null },
      reason: body.note ?? 'Trợ live báo số liệu không khớp',
      actor_id: clients.userId,
    });
    if (audit.error) throw new Error(audit.error.message);

    return NextResponse.json({ notified: recipients.length });
  } catch (error) {
    return uploadErrorResponse(error);
  }
}
