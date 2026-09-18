'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { PRESETS, type Period } from '@/lib/filters/period';

export interface BrandOption {
  id: string;
  name: string;
}

/**
 * Bộ lọc dùng chung: brand + khoảng thời gian (master prompt §43).
 *
 * Ghi vào query string chứ không vào state cục bộ, vì ba lý do: server render
 * được ngay, người dùng gửi link cho nhau được, và bấm Back quay lại đúng thứ
 * vừa xem.
 */
export function FilterBar({
  brands,
  activeBrandId,
  period,
}: {
  brands: BrandOption[];
  activeBrandId: string | null;
  period: Period;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [custom, setCustom] = useState(false);

  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {brands.length > 1 ? (
        <select
          value={activeBrandId ?? ''}
          onChange={(event) => apply({ brand: event.target.value })}
          aria-label="Brand"
          className="h-9 rounded-lg border border-border bg-surface px-2.5 text-sm outline-none focus:border-live"
        >
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      ) : null}

      <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.code}
            type="button"
            onClick={() => {
              setCustom(false);
              apply({ preset: preset.code, from: null, to: null });
            }}
            aria-pressed={period.preset === preset.code}
            className={`rounded-md px-2.5 py-1.5 text-sm transition-colors ${
              period.preset === preset.code
                ? 'bg-live-surface font-medium text-live'
                : 'text-muted hover:text-foreground'
            }`}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustom((value) => !value)}
          aria-pressed={period.preset === null}
          className={`rounded-md px-2.5 py-1.5 text-sm transition-colors ${
            period.preset === null
              ? 'bg-live-surface font-medium text-live'
              : 'text-muted hover:text-foreground'
          }`}
        >
          Tự chọn
        </button>
      </div>

      {custom || period.preset === null ? (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={period.from}
            max={period.to}
            aria-label="Từ ngày"
            onChange={(event) => apply({ from: event.target.value, to: period.to, preset: null })}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-live"
          />
          <span className="text-sm text-muted">→</span>
          <input
            type="date"
            value={period.to}
            min={period.from}
            aria-label="Đến ngày"
            onChange={(event) => apply({ from: period.from, to: event.target.value, preset: null })}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm outline-none focus:border-live"
          />
        </div>
      ) : null}
    </div>
  );
}
