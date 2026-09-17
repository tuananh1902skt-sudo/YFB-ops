import { SessionDetail } from '@/components/session-detail/session-detail';
import { PageState } from '@/components/page-state';
import { buildSessionDetailView } from '@/lib/sessions/detail-view';
import { loadSessionDetail } from '@/lib/sessions/load-detail';
import { createUserClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function SessionDetailPage({ params }: PageProps<'/sessions/[sessionId]'>) {
  const { sessionId } = await params;

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
    return <PageState title="Cần đăng nhập">Đăng nhập để xem chi tiết ca.</PageState>;
  }

  const detail = await loadSessionDetail(supabase, sessionId);
  if (!detail) {
    return (
      <PageState title="Không mở được ca này">
        Ca không tồn tại, hoặc bạn không có quyền xem ca của brand này.
      </PageState>
    );
  }

  return <SessionDetail view={buildSessionDetailView(detail)} />;
}
