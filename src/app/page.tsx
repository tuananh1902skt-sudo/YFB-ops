import Link from 'next/link';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { PageState } from '@/components/page-state';
import { linksFor } from '@/lib/navigation/links';
import type { UserRoleCode } from '@/lib/setup/seed-config';
import { createUserClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let supabase;
  try {
    supabase = await createUserClient();
  } catch {
    return (
      <PageState title="Hệ thống chưa được cấu hình">
        Chưa có kết nối tới Supabase. Các bước khởi tạo ở docs/08_SETUP.md.
      </PageState>
    );
  }

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return <PageState title="Cần đăng nhập">Đăng nhập bằng tài khoản công ty cấp.</PageState>;
  }

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from('users').select('full_name').eq('id', auth.user.id).maybeSingle(),
    supabase.from('user_roles').select('role,brands(name)').eq('user_id', auth.user.id),
  ]);

  const roles = (roleRows ?? []).map((row) => row.role as UserRoleCode);
  const links = linksFor(roles);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{profile?.full_name ?? auth.user.email}</h1>
          <p className="mt-1 text-sm text-muted">
            {roleRows && roleRows.length > 0
              ? roleRows
                  .map((row) => {
                    const brand = row.brands as { name: string } | { name: string }[] | null;
                    const name = Array.isArray(brand) ? brand[0]?.name : brand?.name;
                    return name ? `${row.role} · ${name}` : `${row.role} · toàn hệ thống`;
                  })
                  .join(' — ')
              : 'Chưa được gán vai trò nào'}
          </p>
        </div>
        <SignOutButton />
      </header>

      {links.length === 0 ? (
        <div className="mt-8">
          <PageState title="Chưa có việc nào mở cho tài khoản này">
            Tài khoản đã đăng nhập được nhưng chưa được gán vai trò, nên chưa thấy màn hình nào.
            Nhờ Operation gán vai trò và brand.
          </PageState>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="block rounded-xl border border-border bg-surface p-5 transition-colors hover:border-live"
              >
                <span className="text-base font-medium">{link.label}</span>
                <span className="mt-1 block text-sm text-muted">{link.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
