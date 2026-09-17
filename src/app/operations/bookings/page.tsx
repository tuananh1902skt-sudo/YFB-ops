import Link from 'next/link';
import { BookingReview } from '@/components/bookings/booking-review';
import { PageState } from '@/components/page-state';
import { loadPendingBookings } from '@/lib/planning/load-bookings';
import { createUserClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function BookingReviewPage() {
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
    return <PageState title="Cần đăng nhập">Đăng nhập để duyệt đăng ký ca.</PageState>;
  }

  const bookings = await loadPendingBookings(supabase);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <header className="mb-6">
        <Link href="/operations" className="text-sm text-muted hover:text-foreground">
          ← Cần xử lý
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Duyệt đăng ký ca</h1>
        <p className="mt-2 text-sm text-muted">
          Duyệt là lúc người đó thật sự được gán vào ca — hệ thống kiểm tra trùng giờ ở bước này.
        </p>
      </header>
      <BookingReview bookings={bookings} />
    </main>
  );
}
