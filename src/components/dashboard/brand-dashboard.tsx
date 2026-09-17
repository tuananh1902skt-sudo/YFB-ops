import { DailyGmvChart } from './daily-gmv-chart';
import type { BrandDashboard, QualityRow } from '@/lib/analytics/brand-dashboard';

const STATUS: Record<QualityRow['status'], { icon: string; label: string; className: string }> = {
  // Icon and word both, always: the three status colours sit close enough under
  // colour-vision deficiency that hue alone cannot carry them (docs/06 §3.2).
  good: { icon: '✓', label: 'Ổn', className: 'text-done' },
  warning: { icon: '!', label: 'Cần chú ý', className: 'text-attention' },
  critical: { icon: '▲', label: 'Cần xử lý', className: 'text-blocking' },
};

export function BrandDashboardView({
  dashboard,
  brandName,
}: {
  dashboard: BrandDashboard;
  brandName: string;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8">
      <header className="mb-6">
        <p className="text-sm font-medium text-muted">{brandName}</p>
        <h1 className="text-2xl font-semibold">Kết quả {dashboard.periodLabel}</h1>
        <p className="mt-2 text-sm text-muted">GMV agency vận hành</p>
        <p className="tabular text-4xl font-semibold">{dashboard.gmvDisplay}</p>
        {dashboard.inhouseShareLabel ? (
          <p className="mt-1 text-sm text-muted">
            Brand tự live thêm {dashboard.inhouseGmvDisplay} · {dashboard.inhouseShareLabel}
          </p>
        ) : null}
        {dashboard.excludedSessions > 0 ? (
          <p className="mt-2 rounded-lg border border-attention/30 bg-attention-surface px-3 py-2 text-sm">
            <strong>{dashboard.excludedSessions} ca chưa quy kết được</strong> nên không nằm trong
            các con số trên. Doanh thu của các ca đó là có thật — xem mục chất lượng dữ liệu ở dưới.
          </p>
        ) : null}
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-4">
        {dashboard.tiles.map((tile) => (
          <div key={tile.label}>
            <p className="text-sm text-muted">{tile.label}</p>
            <p className="tabular text-xl font-semibold">{tile.value}</p>
            {tile.caveat ? <p className="mt-0.5 text-xs text-muted">{tile.caveat}</p> : null}
          </div>
        ))}
      </section>

      <section className="mb-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-1 text-lg font-semibold">GMV theo ngày</h2>
        <p className="mb-4 text-sm text-muted">
          Phần agency vận hành và phần brand tự live tách bạch, không gộp chung.
        </p>
        <DailyGmvChart points={dashboard.daily} />
      </section>

      <section className="mb-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-1 text-lg font-semibold">Host</h2>
        <p className="mb-4 text-sm text-muted">
          Luôn kèm bối cảnh — số ca và giờ live — vì một host live khung giờ xấu sẽ luôn thua nếu
          chỉ so GMV tuyệt đối.
        </p>
        {dashboard.hosts.length === 0 ? (
          <p className="text-sm text-muted">Chưa có ca nào của agency trong kỳ.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 font-medium">Host</th>
                <th className="py-2 font-medium">Ca</th>
                <th className="py-2 font-medium">Giờ live</th>
                <th className="py-2 font-medium">GMV</th>
                <th className="py-2 font-medium">GMV / giờ</th>
                <th className="py-2 font-medium">AOV</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.hosts.map((host) => (
                <tr key={host.name} className="border-b border-border last:border-0">
                  <td className="py-2 font-medium">{host.name}</td>
                  <td className="tabular py-2">
                    {host.sessions}
                    {host.unallocatedSessions > 0 ? (
                      <span className="ml-2 text-xs text-attention">
                        {host.unallocatedSessions} ca chưa quy kết
                      </span>
                    ) : null}
                  </td>
                  <td className="tabular py-2">{host.liveHoursDisplay}</td>
                  <td className="tabular py-2">{host.gmvDisplay}</td>
                  <td className="tabular py-2 font-medium">{host.gmvPerHourDisplay}</td>
                  <td className="tabular py-2">{host.aovDisplay}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-lg font-semibold">Chất lượng dữ liệu</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          {dashboard.quality.map((row) => {
            const status = STATUS[row.status];
            return (
              <div key={row.label} className="flex gap-3">
                <span className={`text-sm font-semibold ${status.className}`} aria-hidden>
                  {status.icon}
                </span>
                <div>
                  <dt className="text-sm text-muted">{row.label}</dt>
                  <dd className="tabular text-lg font-semibold">{row.value}</dd>
                  <p className={`text-xs ${status.className}`}>
                    {status.label}
                    {row.note ? ` · ${row.note}` : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </dl>
      </section>
    </main>
  );
}
