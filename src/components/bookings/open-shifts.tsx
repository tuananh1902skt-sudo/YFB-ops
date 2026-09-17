'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NoticeBanner } from '@/components/upload/notice-banner';
import type { OpenSlotView } from '@/lib/planning/load-bookings';
import type { BookingStatus } from '@/lib/planning/types';

const STATUS_LABELS: Partial<Record<BookingStatus, { label: string; tone: 'attention' | 'done' }>> = {
  REGISTERED: { label: 'Đã đăng ký, chờ duyệt', tone: 'attention' },
  PENDING_APPROVAL: { label: 'Chờ duyệt', tone: 'attention' },
  APPROVED: { label: 'Đã được duyệt', tone: 'done' },
  CONFIRMED: { label: 'Đã chốt', tone: 'done' },
};

export function OpenShifts({ slots, readOnly = false }: { slots: OpenSlotView[]; readOnly?: boolean }) {
  const router = useRouter();
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function act(slotId: string, action: 'REGISTER' | 'CANCEL') {
    setBusySlot(slotId);
    setError(null);
    setWarning(null);
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, slotId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Chưa xử lý được.');

      const conflicts = (payload.conflicts ?? []) as { label: string }[];
      if (conflicts.length > 0) {
        // Registering is allowed with a clash; the person is told so they can
        // withdraw before Operation has to weigh it up.
        setWarning(
          `Bạn đã có ca trùng giờ: ${conflicts.map((conflict) => conflict.label).join('; ')}. ` +
            'Operation sẽ xem xét khi duyệt — rút tên nếu bạn không nhận được ca này.',
        );
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusySlot(null);
    }
  }

  if (slots.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <p className="text-base font-medium">Chưa có ca nào đang mở</p>
        <p className="mt-1 text-sm text-muted">
          Khi Operation mở ca cần người, ca sẽ hiện ở đây.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <NoticeBanner notice={{ level: 'BLOCKING', message: error }} /> : null}
      {warning ? <NoticeBanner notice={{ level: 'ATTENTION', message: warning }} /> : null}

      <ul className="space-y-3">
        {slots.map((slot) => {
          const mine = slot.myStatus ? STATUS_LABELS[slot.myStatus] : null;
          const settled = slot.myStatus === 'APPROVED' || slot.myStatus === 'CONFIRMED';

          return (
            <li key={slot.slotId} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{slot.brandName}</span>
                <span className="tabular text-sm">
                  {slot.dateLabel} · {slot.timeLabel}
                </span>
                <Badge>{slot.roleLabel}</Badge>
                {mine ? <Badge tone={mine.tone}>{mine.label}</Badge> : null}
              </div>

              <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <div className="flex gap-2">
                  <dt className="text-muted">Còn trống</dt>
                  <dd className="tabular font-medium">{slot.spotsLeft}</dd>
                </div>
                {slot.registeredCount > 0 ? (
                  <div className="flex gap-2">
                    <dt className="text-muted">Đang chờ duyệt</dt>
                    <dd className="tabular font-medium">{slot.registeredCount}</dd>
                  </div>
                ) : null}
                {slot.targetLabel ? (
                  <div className="flex gap-2">
                    <dt className="text-muted">Target ca</dt>
                    <dd className="tabular font-medium">{slot.targetLabel}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-3">
                {slot.myStatus === null ? (
                  <Button
                    size="lg"
                    disabled={readOnly || busySlot === slot.slotId}
                    onClick={() => act(slot.slotId, 'REGISTER')}
                  >
                    Đăng ký ca này
                  </Button>
                ) : settled ? (
                  <p className="text-sm text-muted">
                    Ca đã chốt cho bạn. Cần đổi thì báo Operation, đừng tự rút.
                  </p>
                ) : (
                  <Button
                    size="lg"
                    variant="secondary"
                    disabled={readOnly || busySlot === slot.slotId}
                    onClick={() => act(slot.slotId, 'CANCEL')}
                  >
                    Rút đăng ký
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
