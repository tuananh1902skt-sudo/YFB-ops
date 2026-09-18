import { Badge } from '@/components/ui/badge';
import { NoticeBanner } from './notice-banner';
import type { SessionPreview } from '@/lib/ingest/upload-preview';

/**
 * Shows the subtraction above the result, never the result alone: a number the
 * team cannot check is a number they will go back to the spreadsheet to verify
 * (docs/06 §2.2).
 */
export function SessionResult({ session }: { session: SessionPreview }) {
  const unallocated = session.method === 'SHARED_UNALLOCATED';

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold tabular">{session.title}</h3>
        {session.ownership === 'UNKNOWN' ? <Badge tone="attention">Chưa xác định ca</Badge> : null}
        {session.ownership === 'BRAND_INHOUSE' ? <Badge tone="outside">Brand tự live</Badge> : null}
        {session.confidenceLabel ? (
          <Badge tone={session.confidence === 'NEEDS_REVIEW' ? 'blocking' : 'attention'}>
            {session.confidenceLabel}
          </Badge>
        ) : null}
      </header>

      <p className="mt-4 text-sm text-muted">Kết quả ca này</p>
      <p
        className={`tabular text-3xl font-semibold ${unallocated ? 'text-attention' : 'text-foreground'}`}
      >
        {session.gmvDisplay}
      </p>

      {session.calculation.length > 0 ? (
        <dl className="mt-4 space-y-1 border-l-2 border-border pl-4">
          {session.calculation.map((step, index) => (
            <div key={`${step.label}-${index}`} className="flex justify-between gap-4 text-sm">
              <dt className="text-muted">{step.label}</dt>
              <dd className="tabular text-foreground">
                {step.operation === 'SUBTRACT' ? '− ' : step.operation === 'ADD' ? '+ ' : ''}
                {step.amount}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <dl className="mt-4 grid grid-cols-3 gap-4 border-t border-border pt-4 text-sm">
        <div>
          <dt className="text-muted">Đơn</dt>
          <dd className="tabular font-medium">{session.ordersDisplay}</dd>
        </div>
        <div>
          <dt className="text-muted">Thời lượng</dt>
          <dd className="tabular font-medium">{session.durationDisplay}</dd>
        </div>
        <div>
          <dt className="text-muted">Cách tính</dt>
          <dd className="font-medium">{session.methodLabel}</dd>
        </div>
      </dl>

      {session.notices.length > 0 ? (
        <div className="mt-4 space-y-2">
          {session.notices.map((notice, index) => (
            <NoticeBanner key={`${notice.message}-${index}`} notice={notice} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
