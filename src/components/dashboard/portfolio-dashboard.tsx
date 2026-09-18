import Link from 'next/link';
import { BrandComparisonChart } from './brand-comparison-chart';
import type { AttentionItem, Portfolio } from '@/lib/analytics/portfolio';

/** Biểu tượng đi kèm chữ, không bao giờ chỉ có màu (docs/06 §3.2). */
const SEVERITY: Record<AttentionItem['severity'], { icon: string; label: string; className: string }> =
  {
    critical: { icon: '▲', label: 'Cần xử lý', className: 'text-blocking' },
    warning: { icon: '!', label: 'Cần chú ý', className: 'text-attention' },
  };

export function PortfolioDashboardView({ portfolio }: { portfolio: Portfolio }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8">
      <header className="mb-6">
        <p className="text-sm font-medium text-muted">Toàn bộ brand</p>
        <h1 className="text-2xl font-semibold">Kết quả {portfolio.periodLabel}</h1>
        <p className="mt-2 text-sm text-muted">GMV agency vận hành, {portfolio.brandCount} brand</p>
        <p className="tabular text-4xl font-semibold">{portfolio.gmvDisplay}</p>
        {portfolio.excludedSessions > 0 ? (
          <p className="mt-2 rounded-lg border border-attention/30 bg-attention-surface px-3 py-2 text-sm">
            <strong>{portfolio.excludedSessions} ca chưa quy kết được</strong> nên không nằm trong
            con số trên
            {portfolio.unallocatedDisplay ? `, tương ứng ${portfolio.unallocatedDisplay}` : ''}. Tiền
            đó là có thật, chỉ là chưa biết thuộc ca nào.
          </p>
        ) : null}
        {portfolio.singleBrand ? (
          <p className="mt-2 text-sm text-muted">
            Mới có một brand nên màn hình này chưa nói thêm được gì so với{' '}
            <Link href="/dashboard" className="underline">
              dashboard brand
            </Link>
            .
          </p>
        ) : null}
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-3">
        {portfolio.tiles.map((tile) => (
          <div key={tile.label}>
            <p className="text-sm text-muted">{tile.label}</p>
            <p className="tabular text-xl font-semibold">{tile.value}</p>
            {tile.caveat ? <p className="mt-0.5 text-xs text-muted">{tile.caveat}</p> : null}
          </div>
        ))}
      </section>

      <section className="mb-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-1 text-lg font-semibold">Cần xem</h2>
        <p className="mb-4 text-sm text-muted">
          Xếp theo mức nghiêm trọng, không theo tên brand. Mỗi dòng dẫn thẳng tới chỗ xử lý được.
        </p>
        {portfolio.attention.length === 0 ? (
          <p className="text-sm text-done">
            ✓ Không có gì đang chặn số liệu — mọi ca đều đã quy kết và xác nhận ownership.
          </p>
        ) : (
          <ul className="space-y-3">
            {portfolio.attention.map((item, index) => {
              const severity = SEVERITY[item.severity];
              return (
                <li key={`${item.brandId}-${index}`} className="flex gap-3">
                  <span className={`mt-0.5 text-sm font-semibold ${severity.className}`}>
                    {severity.icon} {severity.label}
                  </span>
                  <div className="min-w-0">
                    <Link href={item.href} className="font-medium underline">
                      {item.brandName} — {item.headline}
                    </Link>
                    <p className="text-sm text-muted">{item.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mb-6 rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-1 text-lg font-semibold">So sánh brand</h2>
        <p className="mb-4 text-sm text-muted">
          Xếp theo GMV đã quy kết. Phần chưa quy kết vẽ nối tiếp chứ không cộng vào, để brand có
          nhiều tiền treo không trông như bán tốt hơn.
        </p>
        <BrandComparisonChart brands={portfolio.brands} />
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-lg font-semibold">Chi tiết từng brand</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 font-medium">Brand</th>
                <th className="py-2 font-medium">GMV</th>
                <th className="py-2 font-medium">Đạt target</th>
                <th className="py-2 font-medium">Ca</th>
                <th className="py-2 font-medium">Giờ live</th>
                <th className="py-2 font-medium">GMV/giờ</th>
                <th className="py-2 font-medium">AOV</th>
                <th className="py-2 font-medium">Chưa quy kết</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.brands.map((brand) => (
                <tr key={brand.brandId} className="border-b border-border last:border-0">
                  <td className="py-2 font-medium">{brand.brandName}</td>
                  <td className="tabular py-2">{brand.gmvDisplay}</td>
                  <td className="tabular py-2">{brand.achievementDisplay}</td>
                  <td className="tabular py-2">
                    {brand.sessions}
                    {brand.excludedSessions > 0 ? (
                      <span className="text-attention"> ({brand.excludedSessions} chưa tách)</span>
                    ) : null}
                  </td>
                  <td className="tabular py-2">{brand.liveHoursDisplay}</td>
                  <td className="tabular py-2">{brand.gmvPerHourDisplay}</td>
                  <td className="tabular py-2">{brand.aovDisplay}</td>
                  <td className="tabular py-2">
                    {brand.unallocatedDisplay ? (
                      <span className="text-attention">{brand.unallocatedDisplay}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
