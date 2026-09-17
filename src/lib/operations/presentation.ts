import { formatDate, formatMoney, formatTimeRange } from '../format';
import { QUEUE_DEFINITIONS, type QueueCount, type QueueKey, type UnknownStretch } from './types';

export interface QueueRow {
  key: QueueKey;
  label: string;
  urgent: boolean;
  href: string;
  count: number;
  amountDisplay: string | null;
}

export function buildQueueRows(counts: QueueCount[]): QueueRow[] {
  const byKey = new Map(counts.map((item) => [item.key, item]));

  return QUEUE_DEFINITIONS.map((definition) => {
    const found = byKey.get(definition.key);
    return {
      ...definition,
      count: found?.count ?? 0,
      amountDisplay: found?.amount ? formatMoney(found.amount) : null,
    };
  });
}

export interface UnknownStretchRow {
  sessionId: string;
  brandName: string;
  dateDisplay: string;
  timeDisplay: string;
  gmvDisplay: string;
  ordersDisplay: string;
  roomDisplay: string;
  nearby: { sessionId: string; label: string }[];
}

export function buildUnknownStretchRows(stretches: UnknownStretch[]): UnknownStretchRow[] {
  return stretches.map((stretch) => ({
    sessionId: stretch.sessionId,
    brandName: stretch.brandName,
    dateDisplay: formatDate(new Date(`${stretch.sessionDate}T00:00:00+07:00`)),
    timeDisplay: formatTimeRange(stretch.startAt, stretch.endAt),
    gmvDisplay: formatMoney(stretch.gmv),
    ordersDisplay: stretch.orders === null ? '—' : String(stretch.orders),
    // The last digits are enough to tell two rooms apart; the whole 19-digit id
    // is noise on screen.
    roomDisplay: stretch.platformRoomIds.map((id) => `…${id.slice(-6)}`).join(', '),
    nearby: stretch.nearbySessions.map((session) => ({
      sessionId: session.sessionId,
      label: `${formatTimeRange(session.startAt, session.endAt)}${
        session.hostNames.length > 0 ? ` · ${session.hostNames.join(', ')}` : ''
      }`,
    })),
  }));
}
