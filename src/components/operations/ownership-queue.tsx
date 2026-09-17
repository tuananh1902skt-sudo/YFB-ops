'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NoticeBanner } from '@/components/upload/notice-banner';
import type { UnknownStretchRow } from '@/lib/operations/presentation';

type Decision = 'BRAND_INHOUSE' | 'AGENCY';

export function OwnershipQueue({ rows }: { rows: UnknownStretchRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function toggle(sessionId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  async function submit(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const response = await fetch('/api/operations/ownership', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Chưa xử lý được.');

      setDone(`Đã xử lý ${payload.handled} đoạn. Tải lại trang để xem danh sách mới.`);
      setSelected(new Set());
      setReason('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  function decide(action: Decision) {
    submit({ action, sessionIds: [...selected], reason });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-done/30 bg-done-surface p-6">
        <p className="text-base font-medium text-done">Không có đoạn live nào chờ xác nhận</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <NoticeBanner notice={{ level: 'BLOCKING', message: error }} /> : null}
      {done ? <NoticeBanner notice={{ level: 'INFO', message: done }} /> : null}

      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.sessionId}>
            <StretchCard
              row={row}
              checked={selected.has(row.sessionId)}
              onToggle={() => toggle(row.sessionId)}
              busy={busy}
              reason={reason}
              onMerge={(targetSessionId) =>
                submit({
                  action: 'MERGE',
                  sessionIds: [row.sessionId],
                  targetSessionId,
                  reason,
                })
              }
            />
          </li>
        ))}
      </ul>

      <div className="sticky bottom-0 space-y-3 rounded-xl border border-border bg-surface p-4 shadow-lg">
        <label className="block text-sm">
          <span className="font-medium">Lý do</span>
          <span className="ml-2 text-muted">
            bắt buộc — đây là căn cứ để đối chiếu doanh thu sau này
          </span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ví dụ: brand xác nhận tự live sáng 11/09"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted">Đã chọn {selected.size} đoạn</span>
          <Button
            onClick={() => decide('BRAND_INHOUSE')}
            disabled={busy || selected.size === 0 || reason.trim() === ''}
          >
            Brand tự live
          </Button>
          <Button
            variant="secondary"
            onClick={() => decide('AGENCY')}
            disabled={busy || selected.size === 0 || reason.trim() === ''}
          >
            Ca của agency (thiếu booking)
          </Button>
        </div>
      </div>
    </div>
  );
}

function StretchCard({
  row,
  checked,
  onToggle,
  busy,
  reason,
  onMerge,
}: {
  row: UnknownStretchRow;
  checked: boolean;
  onToggle: () => void;
  busy: boolean;
  reason: string;
  onMerge: (targetSessionId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1 h-4 w-4"
          aria-label={`Chọn đoạn ${row.timeDisplay}`}
        />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{row.brandName}</span>
            <span className="tabular text-sm">
              {row.dateDisplay} · {row.timeDisplay}
            </span>
            <Badge tone="attention">Chưa rõ ai vận hành</Badge>
          </div>

          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted">GMV</dt>
              <dd className="tabular font-medium">{row.gmvDisplay}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted">Đơn</dt>
              <dd className="tabular font-medium">{row.ordersDisplay}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted">Room</dt>
              <dd className="tabular">{row.roomDisplay || '—'}</dd>
            </div>
          </dl>

          {row.nearby.length > 0 ? (
            <div className="mt-3 border-t border-border pt-3">
              <p className="text-sm text-muted">
                Ca đã book gần khung giờ này — gộp vào nếu đây chính là ca đó nhập nhầm giờ:
                {reason.trim() === '' ? (
                  <span className="text-attention"> Nhập lý do ở dưới trước khi gộp.</span>
                ) : null}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {row.nearby.map((session) => (
                  <Button
                    key={session.sessionId}
                    variant="secondary"
                    disabled={busy || reason.trim() === ''}
                    onClick={() => onMerge(session.sessionId)}
                  >
                    Gộp vào {session.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
