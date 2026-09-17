import Link from 'next/link';
import type { QueueRow } from '@/lib/operations/presentation';

/**
 * Everything outstanding in one place, urgent first. A row disappears when the
 * work behind it is done, so an empty screen means genuinely nothing to do
 * (docs/06 §B1).
 */
export function QueueList({ rows }: { rows: QueueRow[] }) {
  const outstanding = rows.filter((row) => row.count > 0);

  if (outstanding.length === 0) {
    return (
      <div className="rounded-xl border border-done/30 bg-done-surface p-6">
        <p className="text-base font-medium text-done">Không còn việc nào đang chờ</p>
        <p className="mt-1 text-sm text-foreground">
          Mọi ca đã có dữ liệu, không có đoạn live nào chưa rõ, không có sự kiện nào chờ hậu kiểm.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {outstanding.map((row) => (
        <li key={row.key}>
          <Link
            href={row.href}
            className="flex items-center gap-4 px-4 py-3 text-sm hover:bg-outside-surface"
          >
            {/* Colour never carries the meaning on its own: studio lighting
                distorts it and not everyone sees it the same (docs/06 §3.2). */}
            <span
              className={`w-12 shrink-0 text-xs font-semibold uppercase ${
                row.urgent ? 'text-blocking' : 'text-outside'
              }`}
            >
              {row.urgent ? 'Khẩn' : ''}
            </span>
            <span className="tabular w-8 shrink-0 text-right font-semibold">{row.count}</span>
            <span className="flex-1">{row.label}</span>
            {row.amountDisplay ? (
              <span className="tabular font-medium text-attention">{row.amountDisplay}</span>
            ) : null}
            <span aria-hidden className="text-muted">
              ›
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
