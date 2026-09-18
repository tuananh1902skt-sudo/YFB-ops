import { LiveConsole } from '@/components/live-console/live-console';
import { PageState } from '@/components/page-state';
import { loadLiveConsole } from '@/lib/sessions/load-console';
import { createUserClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function LiveConsolePage({ params }: PageProps<'/live/[sessionId]'>) {
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
    return <PageState title="Cần đăng nhập">Đăng nhập để mở bảng điều khiển ca.</PageState>;
  }

  const data = await loadLiveConsole(supabase, sessionId);
  if (!data) {
    return (
      <PageState title="Không mở được ca này">
        Ca không tồn tại, hoặc bạn không được phân công ca này. Nhờ Operation kiểm tra lại.
      </PageState>
    );
  }

  return <LiveConsole data={data} />;
}
