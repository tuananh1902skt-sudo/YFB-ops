import type { Notice, NoticeLevel } from '@/lib/ingest/upload-preview';

const STYLES: Record<NoticeLevel, { box: string; label: string }> = {
  INFO: { box: 'border-border bg-surface', label: 'Thông tin' },
  ATTENTION: { box: 'border-attention/30 bg-attention-surface', label: 'Cần chú ý' },
  BLOCKING: { box: 'border-blocking/30 bg-blocking-surface', label: 'Phải xử lý' },
};

const TEXT: Record<NoticeLevel, string> = {
  INFO: 'text-muted',
  ATTENTION: 'text-attention',
  BLOCKING: 'text-blocking',
};

export function NoticeBanner({ notice }: { notice: Notice }) {
  const style = STYLES[notice.level];
  return (
    <div className={`rounded-lg border px-4 py-3 ${style.box}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${TEXT[notice.level]}`}>
        {style.label}
      </p>
      <p className="mt-1 text-sm text-foreground">{notice.message}</p>
      {notice.action ? <p className="mt-1 text-sm text-muted">{notice.action}</p> : null}
    </div>
  );
}
