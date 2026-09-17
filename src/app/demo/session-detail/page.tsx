import { SessionDetail } from '@/components/session-detail/session-detail';
import { buildSessionDetailDemo } from '@/lib/ingest/demo-scenarios';
import { buildSessionDetailView } from '@/lib/sessions/detail-view';

export const metadata = { title: 'Xem trước chi tiết ca' };

export default async function DemoSessionDetailPage() {
  const detail = await buildSessionDetailDemo();
  return <SessionDetail view={buildSessionDetailView(detail)} />;
}
