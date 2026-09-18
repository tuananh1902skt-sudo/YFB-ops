import { SignOutButton } from '@/components/auth/sign-out-button';
import { FilterBar } from './filter-bar';
import { Sidebar } from './sidebar';
import { navFor } from '@/lib/navigation/nav';
import type { ShellContext } from '@/lib/shell/context';
import { Suspense, type ReactNode } from 'react';

/**
 * Khung dùng chung cho mọi màn hình sau đăng nhập (master prompt §42).
 *
 * Trước đây mỗi màn hình đứng một mình, người dùng phải bấm Back để đi chỗ khác.
 * Điều hướng cố định là thứ biến một tập trang rời rạc thành một hệ thống.
 */
export function AppShell({
  context,
  showFilters = false,
  children,
}: {
  context: ShellContext;
  /** Bộ lọc chỉ hiện ở màn hình thật sự lọc theo nó — bày bừa thì người dùng đổi mà không thấy gì đổi. */
  showFilters?: boolean;
  children: ReactNode;
}) {
  const groups = navFor(context.roles);
  const roleLabel = context.roles.length > 0 ? context.roles.join(' · ') : 'Chưa có vai trò';

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar groups={groups} brandLabel={context.activeBrand?.name ?? 'Chưa có brand'} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-5 py-3">
          {showFilters ? (
            // FilterBar đọc query string, nên phải có ranh giới Suspense để trang
            // tĩnh vẫn dựng được — nếu không, cả build sẽ đổ ở trang demo.
            <Suspense fallback={<span className="text-sm text-muted">{context.period.label}</span>}>
              <FilterBar
                brands={context.brands}
                activeBrandId={context.activeBrand?.id ?? null}
                period={context.period}
              />
            </Suspense>
          ) : (
            <span className="text-sm text-muted">{context.period.label}</span>
          )}

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium leading-tight">{context.fullName}</p>
              <p className="text-xs text-muted">{roleLabel}</p>
            </div>
            <SignOutButton />
          </div>
        </header>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
