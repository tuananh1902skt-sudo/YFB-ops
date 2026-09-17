import { Badge } from '@/components/ui/badge';
import type { ScheduleDay, ScheduleSession } from '@/lib/planning/schedule-view';

/**
 * A week at a glance. Hours are free-form per brand contract, so the grid is by
 * day rather than by fixed time slots (docs/06 §B3).
 */
export function ScheduleWeek({
  days,
  onCreate,
  onOpen,
}: {
  days: ScheduleDay[];
  onCreate?: (date: string) => void;
  onOpen?: (session: ScheduleSession) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-7">
      {days.map((day) => (
        <section
          key={day.date}
          className={`rounded-xl border p-3 ${
            day.isToday ? 'border-live bg-live-surface' : 'border-border bg-surface'
          }`}
        >
          <header className="mb-2">
            <p className="text-xs text-muted">{day.weekdayLabel}</p>
            <p className="tabular text-sm font-semibold">{day.dayLabel}</p>
          </header>

          <ul className="space-y-2">
            {day.sessions.map((session) => (
              <li key={session.sessionId}>
                <button
                  type="button"
                  onClick={onOpen ? () => onOpen(session) : undefined}
                  className="w-full rounded-lg border border-border bg-surface p-2 text-left hover:border-live"
                >
                  <p className="tabular text-xs font-semibold">{session.timeLabel}</p>
                  <p className="text-xs text-muted">{session.brandName}</p>
                  <div className="mt-1">
                    <Badge tone={session.tone}>{session.statusLabel}</Badge>
                  </div>
                  {session.hostNames.length > 0 ? (
                    <p className="mt-1 text-xs">{session.hostNames.join(', ')}</p>
                  ) : null}
                  {session.missingLabel ? (
                    <p className="mt-1 text-xs text-attention">{session.missingLabel}</p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>

          {onCreate ? (
            <button
              type="button"
              onClick={() => onCreate(day.date)}
              className="mt-2 w-full rounded-lg border border-dashed border-border py-2 text-xs text-muted hover:border-live hover:text-live"
            >
              + Thêm ca
            </button>
          ) : null}
        </section>
      ))}
    </div>
  );
}
