'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { NavIcon } from './nav-icon';
import { activeHref, type NavGroup } from '@/lib/navigation/nav';

export function Sidebar({ groups, brandLabel }: { groups: NavGroup[]; brandLabel: string }) {
  const pathname = usePathname();
  const current = activeHref(groups, pathname);
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Thanh mở menu, chỉ xuất hiện ở màn hình hẹp — trợ live dùng điện thoại
          ngay trong lúc live (docs/06 §3.1). */}
      <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label="Menu"
          className="rounded-lg border border-border p-2 text-muted hover:text-foreground"
        >
          <NavIcon name="command" />
        </button>
        <span className="text-sm font-semibold">YFB Live Agency OS</span>
      </div>

      <nav
        className={`${open ? 'block' : 'hidden'} w-full shrink-0 border-b border-border bg-surface lg:block lg:h-dvh lg:w-64 lg:border-b-0 lg:border-r`}
        aria-label="Điều hướng chính"
      >
        <div className="hidden px-5 py-5 lg:block">
          <p className="text-sm font-semibold leading-tight">YFB Live Agency OS</p>
          <p className="mt-0.5 truncate text-xs text-muted">{brandLabel}</p>
        </div>

        <div className="space-y-5 px-3 pb-5 lg:pb-8">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="px-2 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isCurrent = item.href === current;

                  if (item.available === false) {
                    return (
                      <li key={item.href}>
                        <span
                          title={item.description}
                          className="flex cursor-default items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-muted opacity-60"
                        >
                          <NavIcon name={item.icon} />
                          <span className="truncate">{item.label}</span>
                          <span className="ml-auto shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium">
                            sắp có
                          </span>
                        </span>
                      </li>
                    );
                  }

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={isCurrent ? 'page' : undefined}
                        title={item.description}
                        className={`flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors ${
                          isCurrent
                            ? 'bg-live-surface font-medium text-live'
                            : 'text-foreground hover:bg-outside-surface'
                        }`}
                      >
                        <NavIcon name={item.icon} />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
