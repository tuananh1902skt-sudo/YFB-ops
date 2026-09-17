'use client';

import { Button } from '@/components/ui/button';
import { NoticeBanner } from './notice-banner';
import { SessionResult } from './session-result';
import type { UploadPreview } from '@/lib/ingest/upload-preview';

export function PreviewPanel({
  preview,
  busy,
  onConfirm,
  onEscalate,
  onDiscard,
}: {
  preview: UploadPreview;
  busy: boolean;
  onConfirm: () => void;
  onEscalate: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold">{preview.headline}</h2>
        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted">Dòng đọc được</dt>
            <dd className="tabular font-medium">{preview.rowsParsed}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted">Số liệu mới</dt>
            <dd className="tabular font-medium">{preview.snapshotsCreated}</dd>
          </div>
          {preview.snapshotsSkipped > 0 ? (
            <div className="flex gap-2">
              <dt className="text-muted">Đã có sẵn</dt>
              <dd className="tabular font-medium">{preview.snapshotsSkipped}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {preview.notices.map((notice, index) => (
        <NoticeBanner key={`${notice.message}-${index}`} notice={notice} />
      ))}

      {preview.sessions.map((session) => (
        <SessionResult key={session.sessionId} session={session} />
      ))}

      {preview.failedRows.length > 0 ? (
        <details className="rounded-xl border border-border bg-surface p-5">
          <summary className="cursor-pointer text-sm font-medium">
            {preview.failedRows.length} dòng không đọc được
          </summary>
          <ul className="mt-3 space-y-1 text-sm text-muted">
            {preview.failedRows.map((row) => (
              <li key={row.rowIndex}>
                Dòng {row.rowIndex}: {row.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button size="lg" onClick={onConfirm} disabled={!preview.canConfirm || busy}>
          {busy ? 'Đang lưu…' : 'Xác nhận'}
        </Button>
        <Button size="lg" variant="danger" onClick={onEscalate} disabled={busy}>
          Không khớp — báo Operation
        </Button>
        <Button size="lg" variant="ghost" onClick={onDiscard} disabled={busy}>
          Chọn file khác
        </Button>
      </div>

      {!preview.canConfirm ? (
        <p className="text-sm text-muted">
          Chưa xác nhận được vì còn mục phải xử lý ở trên. Hệ thống không tự sửa số và không
          tự bỏ qua — báo Operation để được xử lý.
        </p>
      ) : null}
    </div>
  );
}
