'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NoticeBanner } from '@/components/upload/notice-banner';
import type { PendingBookingView } from '@/lib/planning/load-bookings';

interface Pending {
  slotId: string;
  userId: string;
}

export function BookingReview({
  bookings,
  readOnly = false,
}: {
  bookings: PendingBookingView[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflictOn, setConflictOn] = useState<Pending | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const key = (booking: Pending) => `${booking.slotId}:${booking.userId}`;

  async function act(
    booking: Pending,
    action: 'APPROVE' | 'REJECT',
    extra: Record<string, unknown> = {},
  ) {
    setBusy(key(booking));
    setError(null);
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...booking, ...extra }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 409) setConflictOn(booking);
        throw new Error(payload.error ?? 'Chưa xử lý được.');
      }
      setConflictOn(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  if (bookings.length === 0) {
    return (
      <div className="rounded-xl border border-done/30 bg-done-surface p-6">
        <p className="text-base font-medium text-done">Không có đăng ký nào chờ duyệt</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <NoticeBanner
          notice={{
            level: conflictOn ? 'ATTENTION' : 'BLOCKING',
            message: error,
            action: conflictOn
              ? 'Nếu vẫn muốn duyệt, nhập lý do chấp nhận trùng giờ rồi bấm lại.'
              : undefined,
          }}
        />
      ) : null}

      <ul className="space-y-3">
        {bookings.map((booking) => {
          const id = key(booking);
          const isConflicting = conflictOn !== null && key(conflictOn) === id;

          return (
            <li key={id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{booking.userName}</span>
                <Badge>{booking.roleLabel}</Badge>
                <span className="tabular text-sm text-muted">
                  {booking.brandName} · {booking.dateLabel} · {booking.timeLabel}
                </span>
                <span className="tabular text-sm text-muted">còn {booking.spotsLeft} chỗ</span>
              </div>

              {booking.note ? <p className="mt-2 text-sm">{booking.note}</p> : null}

              <div className="mt-3 space-y-2">
                <input
                  value={reasons[id] ?? ''}
                  onChange={(event) =>
                    setReasons((current) => ({ ...current, [id]: event.target.value }))
                  }
                  placeholder={
                    isConflicting
                      ? 'Lý do chấp nhận trùng giờ'
                      : 'Lý do (bắt buộc khi từ chối)'
                  }
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={readOnly || busy === id || (isConflicting && !reasons[id]?.trim())}
                    onClick={() =>
                      act(booking, 'APPROVE', isConflicting ? { overrideReason: reasons[id] } : {})
                    }
                  >
                    {isConflicting ? 'Vẫn duyệt' : 'Duyệt'}
                  </Button>
                  <Button
                    variant="danger"
                    disabled={readOnly || busy === id || !reasons[id]?.trim()}
                    onClick={() => act(booking, 'REJECT', { reason: reasons[id] })}
                  >
                    Từ chối
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
