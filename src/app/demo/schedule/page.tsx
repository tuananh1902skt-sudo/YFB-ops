import { ScheduleBoard } from '@/components/schedule/schedule-board';
import { buildSchedule, type ScheduleSessionInput } from '@/lib/planning/schedule-view';

export const metadata = { title: 'Xem trước lịch live' };

const ANCHOR = '2026-09-14';

function shift(
  date: string,
  start: string,
  end: string,
  overrides: Partial<ScheduleSessionInput> = {},
): ScheduleSessionInput {
  return {
    sessionId: `${date}-${start}`,
    brandName: 'Franklin',
    sessionDate: date,
    status: 'CONFIRMED',
    ownership: 'AGENCY',
    plannedStartAt: `${date}T${start}:00+07:00`,
    plannedEndAt: `${end.startsWith('0') ? nextDay(date) : date}T${end}:00+07:00`,
    targetGmv: '30000000',
    hostNames: ['Khói'],
    assistantNames: ['Minh'],
    needs: [
      { role: 'HOST', headcount: 1 },
      { role: 'ASSISTANT', headcount: 1 },
    ],
    ...overrides,
  };
}

function nextDay(date: string): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
}

const sessions: ScheduleSessionInput[] = [
  shift('2026-09-14', '10:00', '13:00'),
  shift('2026-09-14', '19:43', '00:34', { status: 'DATA_COMPLETE', assistantNames: [] }),
  shift('2026-09-15', '20:00', '23:00', { status: 'OPEN_FOR_BOOKING', hostNames: [], assistantNames: [] }),
  shift('2026-09-16', '10:00', '13:00', { status: 'LIVE' }),
  shift('2026-09-16', '13:00', '16:00', { status: 'CONFIRMED', hostNames: ['Linh Ân'] }),
  shift('2026-09-17', '09:00', '11:00', {
    brandName: 'Franklin',
    status: 'DATA_PARTIAL',
    ownership: 'UNKNOWN',
    hostNames: [],
    assistantNames: [],
    needs: [],
    targetGmv: null,
  }),
  shift('2026-09-18', '20:00', '23:30', { status: 'DATA_PENDING' }),
];

export default function DemoSchedulePage() {
  return (
    <ScheduleBoard
      days={buildSchedule(sessions, ANCHOR, '2026-09-16')}
      weekLabel="14/09 – 20/09"
      previousWeek={ANCHOR}
      nextWeek={ANCHOR}
      brands={[{ brandId: 'b1', brandName: 'Franklin', platformAccountId: 'a1' }]}
      staff={[
        { userId: 'u1', name: 'Khói' },
        { userId: 'u2', name: 'Linh Ân' },
        { userId: 'u3', name: 'Minh' },
      ]}
      readOnly
    />
  );
}
