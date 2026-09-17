'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { NoticeBanner } from '@/components/upload/notice-banner';
import { REASON_SUGGESTIONS } from '@/lib/sessions/console-view';
import type { SessionEventType } from '@/lib/sessions/events';

export interface EventDialogConfig {
  eventType: SessionEventType;
  title: string;
  description: string;
  reasonRequired: boolean;
  /** Shown before anything is logged, when the consequence is irreversible. */
  warning?: { message: string; action: string };
  targets?: { sessionId: string; label: string }[];
  targetLabel?: string;
}

export function EventDialog({
  config,
  open,
  busy,
  onOpenChange,
  onSubmit,
}: {
  config: EventDialogConfig | null;
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { reason: string; relatedSessionId: string | null; occurredAt: string }) => void;
}) {
  const [reason, setReason] = useState('');
  const [relatedSessionId, setRelatedSessionId] = useState('');
  const [minutesAgo, setMinutesAgo] = useState(0);

  if (!config) return null;

  const needsTarget = Boolean(config.targets);
  const ready =
    (!config.reasonRequired || reason.trim() !== '') && (!needsTarget || relatedSessionId !== '');

  function close(next: boolean) {
    if (!next) {
      setReason('');
      setRelatedSessionId('');
      setMinutesAgo(0);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={close} title={config.title} description={config.description}>
      <div className="space-y-4">
        {config.warning ? (
          <NoticeBanner
            notice={{
              level: 'BLOCKING',
              message: config.warning.message,
              action: config.warning.action,
            }}
          />
        ) : null}

        {needsTarget ? (
          <label className="block text-sm">
            <span className="font-medium">{config.targetLabel ?? 'Ca liên quan'}</span>
            <select
              value={relatedSessionId}
              onChange={(event) => setRelatedSessionId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">— Chọn ca —</option>
              {config.targets!.map((target) => (
                <option key={target.sessionId} value={target.sessionId}>
                  {target.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <fieldset className="text-sm">
          {/* Pre-filled with now, because that is nearly always right; the
              assistant adjusts only when they are logging after the fact. */}
          <legend className="font-medium">Thời điểm</legend>
          <div className="mt-1 flex gap-2">
            {[0, 5, 15, 30].map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => setMinutesAgo(minutes)}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  minutesAgo === minutes
                    ? 'border-live bg-live-surface text-live'
                    : 'border-border bg-surface'
                }`}
              >
                {minutes === 0 ? 'Bây giờ' : `${minutes} phút trước`}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm">
          <span className="font-medium">Lý do</span>
          <span className="ml-2 text-muted">
            {config.reasonRequired ? 'bắt buộc' : 'không bắt buộc'}
          </span>
          {REASON_SUGGESTIONS[config.eventType] ? (
            <div className="mt-1 flex flex-wrap gap-2">
              {REASON_SUGGESTIONS[config.eventType]!.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setReason(suggestion)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    reason === suggestion
                      ? 'border-live bg-live-surface text-live'
                      : 'border-border bg-surface'
                  }`}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ghi thêm nếu cần"
            className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </label>

        <div className="flex justify-end gap-3">
          <Button variant="ghost" size="lg" onClick={() => close(false)} disabled={busy}>
            Huỷ
          </Button>
          <Button
            size="lg"
            disabled={!ready || busy}
            onClick={() =>
              onSubmit({
                reason,
                relatedSessionId: relatedSessionId || null,
                occurredAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
              })
            }
          >
            {busy ? 'Đang ghi…' : 'Xác nhận'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
