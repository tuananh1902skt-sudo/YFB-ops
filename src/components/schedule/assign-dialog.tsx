'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { NoticeBanner } from '@/components/upload/notice-banner';
import type { ScheduleSession } from '@/lib/planning/schedule-view';
import type { StaffOption } from '@/lib/planning/load-schedule';

export interface ConflictInfo {
  sessionId: string;
  label: string;
}

/**
 * Assigning someone who is already booked elsewhere is refused once, with the
 * clashing shifts named. It can then be accepted deliberately, with a reason
 * that goes to the audit log (docs/07 §G4).
 */
export function AssignDialog({
  open,
  session,
  staff,
  busy,
  error,
  conflicts,
  onOpenChange,
  onAssign,
}: {
  open: boolean;
  session: ScheduleSession | null;
  staff: StaffOption[];
  busy: boolean;
  error: string | null;
  conflicts: ConflictInfo[];
  onOpenChange: (open: boolean) => void;
  onAssign: (input: {
    userId: string;
    role: 'HOST' | 'ASSISTANT';
    overrideReason: string | null;
  }) => void;
}) {
  const [userId, setUserId] = useState('');
  // Opens on the role that is actually short, which is what the person clicked
  // the shift to fill.
  const [role, setRole] = useState<'HOST' | 'ASSISTANT' | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  if (!session) return null;
  const selectedRole = role ?? session.missingRoles[0] ?? 'HOST';
  const blocked = conflicts.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Phân người vào ca"
      description={`${session.brandName} · ${session.timeLabel}`}
    >
      <div className="space-y-4">
        {session.missingLabel ? (
          <p className="text-sm text-attention">{session.missingLabel}</p>
        ) : null}

        {error ? (
          <NoticeBanner
            notice={{
              level: blocked ? 'ATTENTION' : 'BLOCKING',
              message: error,
              action: blocked
                ? 'Nếu đúng là muốn phân trùng giờ, nhập lý do bên dưới rồi xác nhận lại.'
                : undefined,
            }}
          />
        ) : null}

        <label className="block text-sm">
          <span className="font-medium">Người</span>
          <select
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="">— Chọn người —</option>
            {staff.map((person) => (
              <option key={person.userId} value={person.userId}>
                {person.name}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="text-sm">
          <legend className="font-medium">Vai trò trong ca</legend>
          <div className="mt-1 flex gap-2">
            {(['HOST', 'ASSISTANT'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRole(option)}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  selectedRole === option ? 'border-live bg-live-surface text-live' : 'border-border'
                }`}
              >
                {option === 'HOST' ? 'Host' : 'Trợ live'}
              </button>
            ))}
          </div>
        </fieldset>

        {blocked ? (
          <label className="block text-sm">
            <span className="font-medium">Lý do chấp nhận trùng giờ</span>
            <input
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              placeholder="Ví dụ: hai brand cùng studio, chạy song song 1 tiếng"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </label>
        ) : null}

        <div className="flex justify-end gap-3">
          <Button variant="ghost" size="lg" onClick={() => onOpenChange(false)} disabled={busy}>
            Huỷ
          </Button>
          <Button
            size="lg"
            disabled={busy || userId === '' || (blocked && overrideReason.trim() === '')}
            onClick={() =>
              onAssign({
                userId,
                role: selectedRole,
                overrideReason: blocked ? overrideReason : null,
              })
            }
          >
            {busy ? 'Đang lưu…' : blocked ? 'Vẫn phân ca này' : 'Phân ca'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
