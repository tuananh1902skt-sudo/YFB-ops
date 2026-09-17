import { LiveConsole } from '@/components/live-console/live-console';
import type { LiveConsoleData } from '@/lib/sessions/console-view';
import { formatDate, formatTime } from '@/lib/format';

export const metadata = { title: 'Xem trước bảng điều khiển ca' };

// Relative to now, so the console shows a shift genuinely in progress; the
// label is derived from the same instants rather than typed separately.
const startedAt = new Date(Date.now() - 134 * 60_000);
const plannedEndAt = new Date(startedAt.getTime() + 3 * 60 * 60_000);

/** Bản xem thử thiết kế: dữ liệu là ví dụ, luồng thao tác là luồng thật. */
const demo: LiveConsoleData = {
  sessionId: '00000000-0000-0000-0000-000000000001',
  brandName: 'FRANKLIN',
  shiftLabel: `Ca ${formatDate(startedAt)} · ${formatTime(startedAt)} → ${formatTime(plannedEndAt)}`,
  status: 'LIVE',
  startedAt: startedAt.toISOString(),
  plannedEndAt: plannedEndAt.toISOString(),
  hostNames: ['Khói'],
  assistantNames: ['Minh'],
  platformRoomId: '7683505862182275861',
  targetGmvDisplay: '30.000.000 ₫',
  events: [
    {
      id: '1',
      eventType: 'SESSION_STARTED',
      occurredAt: startedAt.toISOString(),
      reason: null,
      actorName: 'Minh',
    },
    {
      id: '2',
      eventType: 'RESTART_TECHNICAL',
      occurredAt: new Date(Date.now() - 50 * 60_000).toISOString(),
      reason: 'Mất mạng',
      actorName: 'Minh',
    },
    {
      id: '3',
      eventType: 'HOST_CHANGED',
      occurredAt: new Date(Date.now() - 16 * 60_000).toISOString(),
      reason: null,
      actorName: 'Minh',
    },
  ],
  handoverTargets: [
    {
      sessionId: '00000000-0000-0000-0000-000000000002',
      label: `${formatTime(plannedEndAt)} → ${formatTime(new Date(plannedEndAt.getTime() + 150 * 60_000))} · Linh Ân`,
    },
  ],
};

export default function DemoLiveConsolePage() {
  return <LiveConsole data={demo} />;
}
