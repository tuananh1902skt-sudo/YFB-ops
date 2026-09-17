import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseLivePerformanceWorkbook } from '../parsing/live-performance';
import { createIngestRepository } from '../supabase/ingest-repository';
import { importLivePerformance } from './live-import';
import { previewLiveImport } from './preview';
import { buildUploadPreview, type UploadPreview } from './upload-preview';

export const IMPORT_BUCKET = 'imports';

export interface UploadClients {
  user: SupabaseClient;
  service: SupabaseClient;
  userId: string;
}

export interface UploadResponse {
  preview: UploadPreview;
  fileHash: string;
  fileName: string;
}

export function hashFile(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** One path per (account, file): the same file always lands in the same place. */
export function storagePathFor(platformAccountId: string, fileHash: string): string {
  return `${platformAccountId}/${fileHash}.xlsx`;
}

/**
 * Reads the file and works out what it would change, storing nothing.
 *
 * The file itself is kept, because a report that was uploaded is evidence even
 * when its figures are rejected — but no figure is recorded until a person has
 * seen the subtraction and confirmed it.
 */
export async function previewUpload(
  clients: UploadClients,
  platformAccountId: string,
  fileName: string,
  buffer: Buffer,
): Promise<UploadResponse> {
  const fileHash = hashFile(buffer);
  const storagePath = storagePathFor(platformAccountId, fileHash);

  const upload = await clients.user.storage
    .from(IMPORT_BUCKET)
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    });
  if (upload.error) throw new Error(`Không lưu được file lên kho: ${upload.error.message}`);

  const parsed = await parseLivePerformanceWorkbook(buffer);
  const repo = createIngestRepository(clients);
  const report = await previewLiveImport(
    repo,
    {
      platformAccountId,
      uploadedBy: clients.userId,
      fileName,
      fileHash,
      storagePath,
    },
    parsed,
  );

  return { preview: buildUploadPreview(report, fileName), fileHash, fileName };
}

/**
 * Commits the upload the person just confirmed.
 *
 * The file is re-read from storage and re-parsed rather than trusting anything
 * the browser sends back, and the figures are recomputed rather than replayed —
 * so a second upload landing in between changes the result instead of being
 * overwritten by a stale preview.
 */
export async function commitUpload(
  clients: UploadClients,
  platformAccountId: string,
  fileName: string,
  fileHash: string,
): Promise<UploadResponse> {
  const storagePath = storagePathFor(platformAccountId, fileHash);
  const download = await clients.user.storage.from(IMPORT_BUCKET).download(storagePath);
  if (download.error) {
    throw new Error(`Không đọc lại được file đã tải lên: ${download.error.message}`);
  }

  const buffer = Buffer.from(await download.data.arrayBuffer());
  if (hashFile(buffer) !== fileHash) {
    throw new Error('File trong kho không khớp với file đã xem trước. Hãy tải lại file.');
  }

  const parsed = await parseLivePerformanceWorkbook(buffer);
  const repo = createIngestRepository(clients);
  const report = await importLivePerformance(
    repo,
    {
      platformAccountId,
      uploadedBy: clients.userId,
      fileName,
      fileHash,
      storagePath,
    },
    parsed,
  );

  return { preview: buildUploadPreview(report, fileName), fileHash, fileName };
}
