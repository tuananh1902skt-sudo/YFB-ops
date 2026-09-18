'use client';

import { useState } from 'react';
import type { TargetSuggestionView } from '@/lib/targets/presentation';

const CONFIDENCE_CLASS: Record<TargetSuggestionView['confidence'], string> = {
  // Biểu tượng + chữ đi kèm màu, vì ba màu trạng thái không tách được bằng sắc độ
  // riêng dưới mù màu (docs/06 §3.5).
  HIGH: 'text-done',
  MEDIUM: 'text-attention',
  LOW: 'text-blocking',
};

const CONFIDENCE_ICON: Record<TargetSuggestionView['confidence'], string> = {
  HIGH: '✓',
  MEDIUM: '!',
  LOW: '▲',
};

/**
 * Đề xuất target, kèm cách nó được tính ra.
 *
 * Con số đứng một mình thì hoặc bị nhận bừa, hoặc bị bỏ qua — cả hai đều làm
 * hỏng mục đích của target. Vì vậy khoảng đề xuất, các hệ số, và **những gì hệ
 * thống chưa biết** đều nằm cùng một chỗ.
 */
export function TargetSuggestion({
  view,
  onUse,
}: {
  view: TargetSuggestionView | null;
  onUse: (value: string) => void;
}) {
  const [showDetail, setShowDetail] = useState(false);

  if (!view) {
    return (
      <p className="rounded-lg border border-border bg-outside-surface px-3 py-2 text-sm text-muted">
        Đang tính đề xuất target…
      </p>
    );
  }

  if (!view.available) {
    return (
      <div className="rounded-lg border border-border bg-outside-surface px-3 py-2">
        <p className="text-sm font-medium">Chưa đề xuất được target</p>
        <p className="mt-0.5 text-sm text-muted">{view.blockedReason}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-live/30 bg-live-surface px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium">Đề xuất</p>
        <p className={`text-xs font-medium ${CONFIDENCE_CLASS[view.confidence]}`}>
          {CONFIDENCE_ICON[view.confidence]} {view.confidenceLabel}
        </p>
      </div>

      <p className="tabular mt-0.5 text-lg font-semibold">{view.rangeLabel}</p>
      <p className="text-xs text-muted">
        Điểm giữa {view.pointLabel} · {view.baselineLabel}
      </p>
      <p className="mt-1 text-xs text-muted">{view.confidenceNote}</p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onUse(view.pointValue!)}
          className="rounded-lg bg-live px-3 py-1.5 text-sm font-medium text-white hover:bg-live/90"
        >
          Dùng {view.pointLabel}
        </button>
        <button
          type="button"
          onClick={() => setShowDetail((value) => !value)}
          aria-expanded={showDetail}
          className="text-sm text-muted underline hover:text-foreground"
        >
          {showDetail ? 'Ẩn cách tính' : 'Xem cách tính'}
        </button>
      </div>

      {showDetail ? (
        <div className="mt-3 space-y-3 border-t border-live/20 pt-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Hệ số</p>
            <ul className="mt-1 space-y-1.5">
              {view.factors.map((factor) => (
                <li key={factor.label} className="text-xs">
                  <span className="font-medium">{factor.label}: </span>
                  <span className={factor.applied ? '' : 'text-muted'}>{factor.effect}</span>
                  <span className="block text-muted">{factor.basis}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Đề xuất này chưa tính tới
            </p>
            <ul className="mt-1 space-y-0.5">
              {view.missingInputs.map((item) => (
                <li key={item} className="text-xs text-muted">
                  · {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
