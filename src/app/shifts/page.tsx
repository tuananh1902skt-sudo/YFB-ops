import { OpenShifts } from '@/components/bookings/open-shifts';
import { PageState } from '@/components/page-state';
import { loadOpenSlots } from '@/lib/planning/load-bookings';
import { createUserClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function OpenShiftsPage() {
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
    return <PageState title="Cần đăng nhập">Đăng nhập để xem ca đang mở.</PageState>;
  }

  const slots = await loadOpenSlots(supabase, auth.user.id);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Ca đang mở</h1>
        <p className="mt-1 text-sm text-muted">
          Đăng ký xong chờ Operation duyệt. Chưa duyệt thì bạn rút tên được.
        </p>
      </header>
      <OpenShifts slots={slots} />
    </main>
  );
}
