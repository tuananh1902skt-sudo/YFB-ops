'use client';

import { useSyncExternalStore } from 'react';

/** One ticking clock shared by every countdown on the page. */
const listeners = new Set<() => void>();
let currentTime = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  timer ??= setInterval(() => {
    currentTime = Date.now();
    for (const notify of listeners) notify();
  }, 1000);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

// The server has no "now" that matches the viewer's, so it renders nothing and
// the countdown appears once the browser takes over.
const serverSnapshot = () => null;

/**
 * A nudge, not a penalty: the shift can still submit after the window closes,
 * it is only recorded as late (docs/06 §A2).
 */
export function SubmissionDeadline({
  shiftEndedAt,
  graceMinutes,
}: {
  shiftEndedAt: string;
  graceMinutes: number;
}) {
  const now = useSyncExternalStore<number | null>(subscribe, () => currentTime, serverSnapshot);
  if (now === null) return null;

  const endedAt = new Date(shiftEndedAt).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((now - endedAt) / 1000));
  const remaining = graceMinutes * 60 - elapsedSeconds;
  const clock = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(
    elapsedSeconds % 60,
  ).padStart(2, '0')}`;

  return (
    <div className="flex items-baseline gap-3">
      <p className={`text-sm ${remaining > 0 ? 'text-muted' : 'text-attention'}`}>
        {remaining > 0
          ? `Còn ${Math.ceil(remaining / 60)} phút để nộp đúng hạn`
          : 'Đã quá hạn nộp — vẫn nộp được, ghi nhận là nộp muộn'}
      </p>
      <p className="tabular text-sm text-muted">⏱ {clock}</p>
    </div>
  );
}
