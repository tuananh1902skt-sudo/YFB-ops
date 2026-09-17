'use client';

import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NoticeBanner } from '@/components/upload/notice-banner';
import { EventDialog, type EventDialogConfig } from './event-dialog';
import { EVENT_LABELS, elapsedLabel, eventLine, type LiveConsoleData } from '@/lib/sessions/console-view';
import { requiresUploadAfter } from '@/lib/sessions/events';

const listeners = new Set<() => void>();
let currentTime = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  timer ??= setInterval(() => {
    currentTime = Date.now();
    for (const notify of listeners) notify();
  }, 30_000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const HANDOVER_WARNING = {
  message: 'Chưa nộp report thì phần doanh thu của ca này sẽ không tách được nữa.',
  action:
    'Tải report từ TikTok Shop ngay bây giờ, trước khi ca sau lên sóng. Bàn giao xong hệ thống đưa thẳng bạn sang màn hình nộp dữ liệu.',
};

export function LiveConsole({ data }: { data: LiveConsoleData }) {
  const router = useRouter();
  const now = useSyncExternalStore<number | null>(subscribe, () => currentTime, () => null);
  const [dialog, setDialog] = useState<EventDialogConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function actions(): EventDialogConfig[] {
    return [
      {
        eventType: 'HANDOVER_AGENCY_TEAM',
        title: 'Bàn giao ca',
        description: 'Ca sau lên sóng mà không tắt phòng live.',
        reasonRequired: false,
        warning: HANDOVER_WARNING,
        targets: data.handoverTargets,
        targetLabel: 'Bàn giao cho ca',
      },
      {
        eventType: 'RESTART_TECHNICAL',
        title: 'Restart phòng live',
        description: 'Phòng live bị tắt và mở lại. Vẫn là một ca, kết quả sẽ được cộng lại.',
        reasonRequired: true,
      },
      {
        eventType: 'HOST_CHANGED',
        title: 'Đổi host',
        description: 'Đổi người trong ca, không tách ca mới.',
        reasonRequired: false,
      },
      {
        eventType: 'OVERTIME_EXTENDED',
        title: 'Kéo dài ca (OT)',
        description: 'Ca chạy quá giờ kế hoạch. Không bị tính là trễ.',
        reasonRequired: false,
      },
      {
        eventType: 'ENDED_EARLY',
        title: 'Off sớm',
        description: 'Kết thúc ca trước giờ kế hoạch.',
        reasonRequired: true,
        warning: HANDOVER_WARNING,
      },
    ];
  }

  async function submit(input: {
    reason: string;
    relatedSessionId: string | null;
    occurredAt: string;
  }) {
    if (!dialog) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/sessions/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: data.sessionId,
          eventType: dialog.eventType,
          occurredAt: input.occurredAt,
          reason: input.reason || null,
          relatedSessionId: input.relatedSessionId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Chưa ghi được sự kiện.');

      const eventType = dialog.eventType;
      setDialog(null);
      // Ending or handing over leads straight to the upload: the moment the
      // report is downloaded is the only cut point the platform gives us.
      if (requiresUploadAfter(eventType)) router.push('/upload');
      else router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <header className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">{data.brandName}</p>
            <h1 className="text-2xl font-semibold">{data.shiftLabel}</h1>
          </div>
          <div className="text-right">
            <Badge tone="live">● ĐANG LIVE</Badge>
            <p className="tabular mt-1 text-lg font-semibold">
              {now === null ? '—' : elapsedLabel(data.startedAt, now)}
            </p>
          </div>
        </div>

        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted">Host</dt>
            <dd className="font-medium">{data.hostNames.join(', ') || '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted">Trợ live</dt>
            <dd className="font-medium">{data.assistantNames.join(', ') || '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted">Room</dt>
            <dd className="tabular">
              {data.platformRoomId ? `…${data.platformRoomId.slice(-6)}` : 'chưa có'}
            </dd>
          </div>
          {data.targetGmvDisplay ? (
            <div className="flex gap-2">
              <dt className="text-muted">Target ca</dt>
              <dd className="tabular font-medium">{data.targetGmvDisplay}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      {error ? (
        <div className="mt-4">
          <NoticeBanner notice={{ level: 'BLOCKING', message: error }} />
        </div>
      ) : null}

      <section className="mt-6">
        <Button
          size="lg"
          className="h-16 w-full text-lg"
          disabled={busy}
          onClick={() =>
            setDialog({
              eventType: 'SESSION_ENDED',
              title: 'Kết thúc ca',
              description: 'Chốt mốc kết thúc thực tế của ca này.',
              reasonRequired: false,
              warning: HANDOVER_WARNING,
            })
          }
        >
          KẾT THÚC CA
        </Button>

        <div className="mt-3 flex flex-wrap gap-2">
          {actions().map((action) => (
            <Button
              key={action.eventType}
              variant="secondary"
              size="lg"
              disabled={busy}
              onClick={() => setDialog(action)}
            >
              {EVENT_LABELS[action.eventType]}
            </Button>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Diễn biến ca</h2>
        {data.events.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Chưa có sự kiện nào. Mọi thứ xảy ra trong ca hãy log ngay lúc đó — đây là căn cứ để hệ
            thống tách đúng kết quả từng ca.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.events.map((event) => {
              const line = eventLine(event);
              return (
                <li key={event.id} className="flex gap-3 text-sm">
                  <span className="tabular w-12 shrink-0 text-muted">{line.time}</span>
                  <span>{line.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <EventDialog
        config={dialog}
        open={dialog !== null}
        busy={busy}
        onOpenChange={(next) => {
          if (!next) setDialog(null);
        }}
        onSubmit={submit}
      />
    </main>
  );
}
