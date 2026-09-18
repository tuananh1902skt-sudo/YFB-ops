import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { PageState } from '@/components/page-state';
import { loadShellContext, type SearchParams } from '@/lib/shell/context';
import { createUserClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Màn hình nào thật sự lọc theo brand + khoảng thời gian thì mới hiện thanh lọc. */
const FILTERED = ['/dashboard'];

function searchParamsFrom(url: string): { params: SearchParams; pathname: string } {
  const [pathname, query = ''] = url.split('?');
  const params: SearchParams = {};
  for (const [key, value] of new URLSearchParams(query)) params[key] = value;
  return { params, pathname };
}

export default async function AppLayout({ children }: { children: ReactNode }) {
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
  if (!auth.user) redirect('/login');

  const url = (await headers()).get('x-url') ?? '/';
  const { params, pathname } = searchParamsFrom(url);
  const context = await loadShellContext(
    supabase,
    auth.user.id,
    auth.user.email ?? '',
    params,
  );

  return (
    <AppShell
      context={context}
      showFilters={FILTERED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))}
    >
      {children}
    </AppShell>
  );
}
