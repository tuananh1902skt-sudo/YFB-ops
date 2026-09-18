import { QueueList } from '@/components/operations/queue-list';
import { PageState } from '@/components/page-state';
import { buildQueueRows } from '@/lib/operations/presentation';
import { loadQueueCounts } from '@/lib/operations/queue';
import { formatDate } from '@/lib/format';
import { createUserClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function OperationsPage() {
  let supabase;
  try {
    supabase = await createUserClient();
  } catch {
    return (
      <PageState title="Hệ thống chưa được cấu hình">
        Chưa có kết nối tới Supabase. Liên hệ quản trị hệ thống để điền biến môi trường.
      </PageState>
    );
  }

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return <PageState title="Cần đăng nhập">Đăng nhập bằng tài khoản YFB để xem hàng đợi.</PageState>;
  }

  const now = new Date();
  const rows = buildQueueRows(await loadQueueCounts(supabase, now));

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Cần xử lý</h1>
        <p className="text-sm text-muted">Hôm nay {formatDate(now)}</p>
      </header>
      <QueueList rows={rows} />
    </main>
  );
}
