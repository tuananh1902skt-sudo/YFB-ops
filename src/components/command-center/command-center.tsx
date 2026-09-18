import Link from 'next/link';
import { formatPercent } from '@/lib/format';
import type { Alert, CommandCenter, TodayShift } from '@/lib/command-center/types';

/** Biểu tượng đi kèm chữ, không bao giờ chỉ có màu (docs/06 §3.2). */
const SEVERITY: Record<Alert['severity'], { icon: string; label: string; className: string }> = {
  critical: { icon: '▲', label: 'Cần xử lý', className: 'text-blocking' },
  warning: { icon: '!', label: 'Cần chú ý', className: 'text-attention' },
};

const OWNERSHIP_LABEL: Record<TodayShift['ownership'], string | null> = {
  AGENCY: null,
  BRAND_INHOUSE: 'Brand tự live',
  UNKNOWN: 'Chưa rõ ai vận hành',
};

function ShiftRow({ shift }: { shift: TodayShift }) {
  const ownership = OWNERSHIP_LABEL[shift.ownership];

  return (
    <li>
      <Link
        href={`/sessions/${shift.sessionId}`}
        className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-live"
      >
        <span className="tabular w-[128px] shrink-0 text-sm font-medium">{shift.timeLabel}</span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{shift.brandName}</span>
          <span className="block truncate text-xs text-muted">
            {shift.staffNames.length > 0 ? (
              shift.staffNames.join(', ')
            ) : shift.ownership === 'AGENCY' ? (
              // Chỉ ca agency mới thiếu người. Ca brand tự live không có ai bên
              // mình là đúng, tô đỏ ở đó là nói sai.
              <span className="text-blocking">Chưa có người</span>
            ) : null}
            {ownership ? `${shift.staffNames.length > 0 ? ' · ' : ''}${ownership}` : ''}
          </span>
        </span>

        {shift.isLive ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-live-surface px-2.5 py-1 text-xs font-medium text-live">
            <span className="h-1.5 w-1.5 rounded-full bg-live" aria-hidden />
            Đang live
          </span>
        ) : null}

        <span className="w-[150px] shrink-0 text-right">
          <span className="tabular block text-sm font-medium">{shift.gmvDisplay ?? '—'}</span>
          {shift.progress !== null ? (
            <span className="tabular block text-xs text-muted">
              {formatPercent(shift.progress)} target
            </span>
          ) : shift.gmvDisplay === null ? (
            <span className="block text-xs text-muted">Chưa có dữ liệu</span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

export function CommandCenterView({ center }: { center: CommandCenter }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Hôm nay, {center.dateLabel}</h1>
        <p className="mt-1 text-sm text-muted">
          Những gì đang diễn ra và những gì đang chặn số liệu.
        </p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-4">
        {center.tiles.map((tile) => (
          <div key={tile.label}>
            <p className="text-sm text-muted">{tile.label}</p>
            <p className="tabular text-xl font-semibold">{tile.value}</p>
            {tile.caveat ? <p className="mt-0.5 text-xs text-muted">{tile.caveat}</p> : null}
          </div>
        ))}
      </section>

      {center.quiet ? (
        <section className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-base font-medium">
            Hôm nay không có ca nào, cũng không có việc gì kẹt.
          </p>
          <p className="mt-1 text-sm text-muted">
            Tạo ca ở{' '}
            <Link href="/schedule" className="underline">
              Lịch live
            </Link>
            , hoặc nộp dữ liệu ca đã chạy ở{' '}
            <Link href="/upload" className="underline">
              Nộp dữ liệu
            </Link>
            .
          </p>
        </section>
      ) : null}

      {center.alerts.length > 0 ? (
        <section className="mb-6 rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-1 text-lg font-semibold">Cần xử lý</h2>
          <p className="mb-4 text-sm text-muted">
            Xếp theo mức nghiêm trọng. Mỗi dòng dẫn thẳng tới chỗ xử lý được.
          </p>
          <ul className="space-y-3">
            {center.alerts.map((alert, index) => {
              const severity = SEVERITY[alert.severity];
              return (
                <li key={`${alert.href}-${index}`} className="flex gap-3">
                  <span className={`mt-0.5 shrink-0 text-sm font-semibold ${severity.className}`}>
                    {severity.icon} {severity.label}
                  </span>
                  <div className="min-w-0">
                    <Link href={alert.href} className="font-medium underline">
                      {alert.headline}
                    </Link>
                    <p className="text-sm text-muted">{alert.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {center.live.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">Đang live</h2>
          <ul className="space-y-2">
            {center.live.map((shift) => (
              <ShiftRow key={shift.sessionId} shift={shift} />
            ))}
          </ul>
        </section>
      ) : null}

      {center.shifts.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Ca hôm nay</h2>
          <ul className="space-y-2">
            {center.shifts.map((shift) => (
              <ShiftRow key={shift.sessionId} shift={shift} />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
