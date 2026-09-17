'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { NoticeBanner } from '@/components/upload/notice-banner';
import { AssignDialog, type ConflictInfo } from './assign-dialog';
import { ScheduleWeek } from './schedule-week';
import { SessionFormDialog, type BrandOption } from './session-form-dialog';
import type { ScheduleDay, ScheduleSession } from '@/lib/planning/schedule-view';
import type { StaffOption } from '@/lib/planning/load-schedule';

export function ScheduleBoard({
  days,
  weekLabel,
  previousWeek,
  nextWeek,
  brands,
  staff,
  readOnly = false,
}: {
  days: ScheduleDay[];
  weekLabel: string;
  previousWeek: string;
  nextWeek: string;
  brands: BrandOption[];
  staff: StaffOption[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [creatingOn, setCreatingOn] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<ScheduleSession | null>(null);
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function send(path: string, method: string, body: unknown) {
    const response = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) {
      const failure = new Error(payload.error ?? 'Chưa lưu được.') as Error & {
        conflicts?: ConflictInfo[];
      };
      failure.conflicts = payload.conflicts;
      throw failure;
    }
    return payload;
  }

  async function createSession(input: Parameters<typeof send>[2]) {
    setBusy(true);
    setError(null);
    try {
      const result = (await send('/api/sessions', 'POST', input)) as { warnings?: string[] };
      setCreatingOn(null);
      setNotice(result.warnings?.[0] ?? 'Đã tạo ca.');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function assign(input: {
    userId: string;
    role: 'HOST' | 'ASSISTANT';
    overrideReason: string | null;
  }) {
    if (!assigning) return;
    setBusy(true);
    setError(null);
    try {
      await send('/api/sessions/staff', 'POST', { sessionId: assigning.sessionId, ...input });
      setAssigning(null);
      setConflicts([]);
      setNotice('Đã phân ca.');
      router.refresh();
    } catch (cause) {
      const failure = cause as Error & { conflicts?: ConflictInfo[] };
      setError(failure.message);
      setConflicts(failure.conflicts ?? []);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Lịch live</h1>
          <p className="tabular text-sm text-muted">{weekLabel}</p>
        </div>
        {readOnly ? null : (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.push(`/schedule?week=${previousWeek}`)}>
              ← Tuần trước
            </Button>
            <Button variant="secondary" onClick={() => router.push(`/schedule?week=${nextWeek}`)}>
              Tuần sau →
            </Button>
          </div>
        )}
      </header>

      {notice ? (
        <div className="mb-4">
          <NoticeBanner notice={{ level: 'INFO', message: notice }} />
        </div>
      ) : null}
      {error && !assigning ? (
        <div className="mb-4">
          <NoticeBanner notice={{ level: 'BLOCKING', message: error }} />
        </div>
      ) : null}

      <ScheduleWeek
        days={days}
        onCreate={readOnly ? undefined : (date) => setCreatingOn(date)}
        onOpen={(session) => {
          setConflicts([]);
          setError(null);
          setAssigning(session);
        }}
      />

      <SessionFormDialog
        open={creatingOn !== null}
        date={creatingOn}
        brands={brands}
        busy={busy}
        onOpenChange={(open) => {
          if (!open) setCreatingOn(null);
        }}
        onSubmit={createSession}
      />

      <AssignDialog
        open={assigning !== null}
        session={assigning}
        staff={staff}
        busy={busy}
        error={error}
        conflicts={conflicts}
        onOpenChange={(open) => {
          if (!open) {
            setAssigning(null);
            setConflicts([]);
            setError(null);
          }
        }}
        onAssign={assign}
      />
    </main>
  );
}
