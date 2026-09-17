import Link from 'next/link';
import { OwnershipQueue } from '@/components/operations/ownership-queue';
import { PageState } from '@/components/page-state';
import { buildUnknownStretchRows } from '@/lib/operations/presentation';
import { loadUnknownStretches } from '@/lib/operations/queue';
import { createUserClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function OwnershipQueuePage() {
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
    return <PageState title="Cần đăng nhập">Đăng nhập để xác nhận ownership.</PageState>;
  }

  const rows = buildUnknownStretchRows(await loadUnknownStretches(supabase));

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <header className="mb-6">
        <Link href="/operations" className="text-sm text-muted hover:text-foreground">
          ← Cần xử lý
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Đoạn live chưa rõ ai vận hành</h1>
        <p className="mt-2 text-sm text-muted">
          Hệ thống tìm thấy các đoạn live không khớp ca nào đã book. Chừng nào chưa xác nhận,
          các đoạn này không vào bất kỳ KPI nào của agency.
        </p>
      </header>
      <OwnershipQueue rows={rows} />
    </main>
  );
}
