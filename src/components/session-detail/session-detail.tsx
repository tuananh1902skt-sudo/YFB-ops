import { Badge } from '@/components/ui/badge';
import type { SessionDetailView } from '@/lib/sessions/detail-view';

/**
 * The screen that answers "where did this number come from".
 *
 * It shows the chain in the order someone asks about it: what was planned
 * against what happened, then the arithmetic that produced each figure, then
 * the metrics derived from those figures, then everything that has changed.
 */
export function SessionDetail({ view }: { view: SessionDetailView }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <header className="mb-6">
        <p className="text-sm font-medium text-muted">{view.brandName}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{view.title}</h1>
          {view.ownershipLabel ? <Badge tone="attention">{view.ownershipLabel}</Badge> : null}
          {view.confidenceLabel ? (
            <Badge tone={view.confidence === 'NEEDS_REVIEW' ? 'blocking' : 'attention'}>
              {view.confidenceLabel}
            </Badge>
          ) : null}
        </div>
        <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted">Host</dt>
            <dd className="font-medium">{view.hostNames.join(', ') || '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted">Trợ live</dt>
            <dd className="font-medium">{view.assistantNames.join(', ') || '—'}</dd>
          </div>
        </dl>
        <p className="tabular mt-3 text-3xl font-semibold">{view.gmvDisplay}</p>
        {!view.countsTowardAgency ? (
          <p className="mt-2 rounded-lg border border-outside bg-outside-surface px-3 py-2 text-sm">
            Ca này <strong>không tính vào</strong> KPI, target achievement hay hiệu suất host của
            agency. Số liệu vẫn giữ để đối chiếu tổng GMV toàn shop.
          </p>
        ) : null}
      </header>

      <Section title="Kế hoạch và thực tế">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="py-2 font-medium"> </th>
              <th className="py-2 font-medium">Kế hoạch</th>
              <th className="py-2 font-medium">Thực tế</th>
            </tr>
          </thead>
          <tbody>
            {view.planActual.map((row) => (
              <tr key={row.label} className="border-b border-border last:border-0">
                <td className="py-2 text-muted">{row.label}</td>
                <td className="tabular py-2">{row.planned}</td>
                <td className="py-2">
                  <span className="tabular font-medium">{row.actual}</span>
                  {row.note ? <span className="ml-2 text-muted">{row.note}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Con số này ở đâu ra">
        <div className="space-y-4">
          {view.lineage.length === 0 ? (
            <p className="text-sm text-muted">Chưa có dữ liệu nộp cho ca này.</p>
          ) : null}
          {view.lineage.map((block) => (
            <div key={block.attributionId} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                <span className="tabular font-medium">{block.roomLabel}</span>
                <span className="tabular text-muted">{block.windowLabel}</span>
                <span className="tabular text-muted">{block.durationLabel}</span>
                <span className="text-muted">{block.methodLabel}</span>
              </div>

              <dl className="mt-3 space-y-1">
                {block.steps.map((step, index) => (
                  <div
                    key={`${step.label}-${index}`}
                    className={`flex flex-wrap items-baseline justify-between gap-2 text-sm ${
                      step.operation === 'RESULT'
                        ? 'border-t border-border pt-2 font-semibold'
                        : ''
                    }`}
                  >
                    <dt className={step.operation === 'RESULT' ? '' : 'text-muted'}>
                      {step.label}
                      {step.fileName && step.importId ? (
                        <a
                          href={`/api/imports/${step.importId}/file`}
                          className="ml-2 text-xs text-live underline"
                        >
                          {step.fileName}
                        </a>
                      ) : null}
                    </dt>
                    <dd className="tabular">
                      {step.operation === 'SUBTRACT' ? '− ' : ''}
                      {step.amount}
                    </dd>
                  </div>
                ))}
              </dl>

              {block.note ? <p className="mt-3 text-sm text-attention">{block.note}</p> : null}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Chỉ số">
        <p className="mb-3 text-sm text-muted">
          Tất cả tính lại từ số đã tách của riêng ca này, không lấy sẵn từ file.
        </p>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {view.kpis.map((kpi) => (
            <div key={kpi.label}>
              <dt className="text-sm text-muted">{kpi.label}</dt>
              <dd className="tabular text-lg font-semibold">{kpi.value}</dd>
              {kpi.caveat ? <p className="mt-0.5 text-xs text-muted">{kpi.caveat}</p> : null}
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Lịch sử">
        {view.history.length === 0 ? (
          <p className="text-sm text-muted">Chưa có thay đổi nào được ghi nhận.</p>
        ) : (
          <ul className="space-y-2">
            {view.history.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="flex gap-3 text-sm">
                <span className="tabular w-12 shrink-0 text-muted">{entry.timeLabel}</span>
                <span>
                  {entry.title}
                  {entry.detail ? <span className="text-muted"> — {entry.detail}</span> : null}
                  {entry.actorName ? (
                    <span className="text-muted"> · {entry.actorName}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
