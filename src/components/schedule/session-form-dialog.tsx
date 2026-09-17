'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { NoticeBanner } from '@/components/upload/notice-banner';

export interface BrandOption {
  brandId: string;
  brandName: string;
  platformAccountId: string;
}

export function SessionFormDialog({
  open,
  date,
  brands,
  busy,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  date: string | null;
  brands: BrandOption[];
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    brandId: string;
    platformAccountId: string;
    plannedStartAt: string;
    plannedEndAt: string;
    targetGmv: string | null;
    staffNeeds: { role: 'HOST' | 'ASSISTANT'; headcount: number }[];
  }) => void;
}) {
  const [brandId, setBrandId] = useState(brands[0]?.brandId ?? '');
  const [startTime, setStartTime] = useState('19:00');
  const [endTime, setEndTime] = useState('22:00');
  const [targetGmv, setTargetGmv] = useState('');
  const [hosts, setHosts] = useState(1);
  const [assistants, setAssistants] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const brand = brands.find((item) => item.brandId === brandId);
  const crossesMidnight = endTime <= startTime;

  function submit() {
    if (!date || !brand) {
      setError('Chọn brand trước khi lưu.');
      return;
    }
    setError(null);

    const start = `${date}T${startTime}:00+07:00`;
    // A shift typed as 20:00 → 00:30 means the next morning, and the day it
    // belongs to is still the day it started (docs/01 §12).
    const endDate = crossesMidnight ? nextDay(date) : date;
    const end = `${endDate}T${endTime}:00+07:00`;

    onSubmit({
      brandId: brand.brandId,
      platformAccountId: brand.platformAccountId,
      plannedStartAt: new Date(start).toISOString(),
      plannedEndAt: new Date(end).toISOString(),
      targetGmv: targetGmv.trim() === '' ? null : targetGmv.replace(/\D/g, ''),
      staffNeeds: [
        ...(hosts > 0 ? [{ role: 'HOST' as const, headcount: hosts }] : []),
        ...(assistants > 0 ? [{ role: 'ASSISTANT' as const, headcount: assistants }] : []),
      ],
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Tạo ca live"
      description={date ? `Ngày ${date.slice(8, 10)}/${date.slice(5, 7)}` : undefined}
    >
      <div className="space-y-4">
        {error ? <NoticeBanner notice={{ level: 'BLOCKING', message: error }} /> : null}

        <label className="block text-sm">
          <span className="font-medium">Brand</span>
          <select
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            {brands.map((option) => (
              <option key={option.brandId} value={option.brandId}>
                {option.brandName}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="font-medium">Bắt đầu</span>
            <input
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className="tabular mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Kết thúc</span>
            <input
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className="tabular mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </label>
        </div>

        {crossesMidnight ? (
          <p className="text-sm text-muted">
            Ca kết thúc sang ngày hôm sau. Ca vẫn được tính vào ngày bắt đầu.
          </p>
        ) : null}

        <label className="block text-sm">
          <span className="font-medium">Target GMV</span>
          <span className="ml-2 text-muted">không bắt buộc</span>
          <input
            value={targetGmv}
            onChange={(event) => setTargetGmv(event.target.value)}
            inputMode="numeric"
            placeholder="30000000"
            className="tabular mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="font-medium">Cần host</span>
            <input
              type="number"
              min={0}
              max={5}
              value={hosts}
              onChange={(event) => setHosts(Number(event.target.value))}
              className="tabular mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Cần trợ live</span>
            <input
              type="number"
              min={0}
              max={5}
              value={assistants}
              onChange={(event) => setAssistants(Number(event.target.value))}
              className="tabular mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="ghost" size="lg" onClick={() => onOpenChange(false)} disabled={busy}>
            Huỷ
          </Button>
          <Button size="lg" onClick={submit} disabled={busy}>
            {busy ? 'Đang lưu…' : 'Tạo ca'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function nextDay(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  return new Date(day.getTime() + 86_400_000).toISOString().slice(0, 10);
}
