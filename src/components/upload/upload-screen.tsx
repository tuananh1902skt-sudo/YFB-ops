'use client';

import { useState } from 'react';
import { FileDropzone } from './file-dropzone';
import { NoticeBanner } from './notice-banner';
import { PreviewPanel } from './preview-panel';
import { SubmissionDeadline } from './submission-deadline';
import type { UploadPreview } from '@/lib/ingest/upload-preview';

export interface UploadScreenProps {
  platformAccountId: string;
  brandName: string;
  shiftTitle: string;
  shiftEndedAt: string | null;
  graceMinutes: number;
  guideUrl?: string;
}

type Stage =
  | { name: 'IDLE' }
  | { name: 'READING' }
  | { name: 'PREVIEW'; preview: UploadPreview; fileHash: string; fileName: string }
  | { name: 'SAVING'; preview: UploadPreview; fileHash: string; fileName: string }
  | { name: 'SAVED'; preview: UploadPreview };

export function UploadScreen(props: UploadScreenProps) {
  const [stage, setStage] = useState<Stage>({ name: 'IDLE' });
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reported, setReported] = useState(false);

  async function send(path: string, body: FormData | string): Promise<Record<string, unknown>> {
    const response = await fetch(path, {
      method: 'POST',
      body,
      headers: typeof body === 'string' ? { 'content-type': 'application/json' } : undefined,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Không gửi được yêu cầu.');
    return payload;
  }

  async function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    setStage({ name: 'READING' });

    const form = new FormData();
    form.set('platformAccountId', props.platformAccountId);
    form.set('file', file);

    try {
      const result = await send('/api/imports/live/preview', form);
      setStage({
        name: 'PREVIEW',
        preview: result.preview as UploadPreview,
        fileHash: result.fileHash as string,
        fileName: result.fileName as string,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStage({ name: 'IDLE' });
    }
  }

  async function handleConfirm() {
    if (stage.name !== 'PREVIEW') return;
    setError(null);
    setStage({ ...stage, name: 'SAVING' });

    try {
      const result = await send(
        '/api/imports/live/commit',
        JSON.stringify({
          platformAccountId: props.platformAccountId,
          fileName: stage.fileName,
          fileHash: stage.fileHash,
        }),
      );
      setStage({ name: 'SAVED', preview: result.preview as UploadPreview });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStage({ ...stage, name: 'PREVIEW' });
    }
  }

  async function handleEscalate() {
    if (stage.name !== 'PREVIEW') return;
    setError(null);
    try {
      await send(
        '/api/imports/live/escalate',
        JSON.stringify({
          platformAccountId: props.platformAccountId,
          fileName: stage.fileName,
          fileHash: stage.fileHash,
        }),
      );
      setReported(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const busy = stage.name === 'READING' || stage.name === 'SAVING';

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <header className="mb-6">
        <p className="text-sm font-medium text-muted">{props.brandName}</p>
        <h1 className="text-2xl font-semibold">Nộp dữ liệu — {props.shiftTitle}</h1>
        {props.shiftEndedAt ? (
          <SubmissionDeadline
            shiftEndedAt={props.shiftEndedAt}
            graceMinutes={props.graceMinutes}
          />
        ) : null}
      </header>

      {stage.name === 'SAVED' ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-done/30 bg-done-surface p-5">
            <h2 className="text-lg font-semibold text-done">Đã lưu dữ liệu ca</h2>
            <p className="mt-1 text-sm text-foreground">
              Số liệu đã vào hệ thống. Nếu có gì sai, Operation sửa được và hệ thống sẽ tính lại.
            </p>
          </div>
          {stage.preview.sessions.map((session) => (
            <div key={session.sessionId} className="rounded-xl border border-border bg-surface p-5">
              <p className="text-sm text-muted">{session.title}</p>
              <p className="tabular text-2xl font-semibold">{session.gmvDisplay}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <ol className="space-y-3">
            <li className="flex items-baseline gap-3 text-base">
              <span className="tabular text-sm font-semibold text-muted">Bước 1</span>
              <span>
                Tải report từ TikTok Shop{' '}
                {props.guideUrl ? (
                  <a className="text-live underline" href={props.guideUrl}>
                    Xem hướng dẫn
                  </a>
                ) : null}
              </span>
            </li>
            <li className="flex items-baseline gap-3 text-base">
              <span className="tabular text-sm font-semibold text-muted">Bước 2</span>
              <span>Kéo file vào đây hoặc chọn file</span>
            </li>
          </ol>

          {stage.name === 'IDLE' || stage.name === 'READING' ? (
            <FileDropzone onFile={handleFile} busy={busy} fileName={fileName} />
          ) : null}

          {error ? (
            <NoticeBanner
              notice={{
                level: 'BLOCKING',
                message: error,
                action: 'Thử lại, hoặc báo Operation nếu vẫn không được.',
              }}
            />
          ) : null}

          {reported ? (
            <NoticeBanner
              notice={{
                level: 'INFO',
                message: 'Đã chuyển file này cho Operation xem lại.',
                action: 'Bạn không cần chờ — Operation sẽ xử lý và báo lại.',
              }}
            />
          ) : null}

          {stage.name === 'PREVIEW' || stage.name === 'SAVING' ? (
            <PreviewPanel
              preview={stage.preview}
              busy={busy}
              onConfirm={handleConfirm}
              onEscalate={handleEscalate}
              onDiscard={() => {
                setFileName(null);
                setStage({ name: 'IDLE' });
              }}
            />
          ) : null}
        </div>
      )}
    </main>
  );
}
