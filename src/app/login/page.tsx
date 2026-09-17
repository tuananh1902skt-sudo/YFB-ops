import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { PageState } from '@/components/page-state';
import { createUserClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Chỉ nhận đường dẫn nội bộ, để tham số trên URL không đá người dùng ra ngoài. */
function safeRedirect(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const target = safeRedirect((await searchParams).next);

  let supabase;
  try {
    supabase = await createUserClient();
  } catch {
    return (
      <PageState title="Hệ thống chưa được cấu hình">
        Chưa có kết nối tới Supabase. Điền NEXT_PUBLIC_SUPABASE_URL và
        NEXT_PUBLIC_SUPABASE_ANON_KEY rồi khởi động lại (xem docs/08_SETUP.md).
      </PageState>
    );
  }

  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(target);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold">YFB Live Agency OS</h1>
      <p className="mt-1 mb-8 text-sm text-muted">Đăng nhập bằng tài khoản công ty cấp.</p>
      <LoginForm redirectTo={target} />
      <p className="mt-6 text-sm text-muted">
        Chưa có tài khoản thì liên hệ Operation — hệ thống không mở đăng ký tự do.
      </p>
    </main>
  );
}
