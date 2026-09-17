'use client';

import { useState } from 'react';
import { formatMoney, formatMoneyCompact } from '@/lib/format';
import type { DailyPoint } from '@/lib/analytics/brand-dashboard';

/**
 * GMV per day, agency against the brand's own streams.
 *
 * Emphasis rather than two equal series: the agency's figure is the subject and
 * the brand's own streaming is context, so it takes the accent colour and the
 * rest is grey. The target rides the same axis as a reference tick — it is the
 * same unit, and a second scale would make the two look comparable when they
 * are not.
 */
const HEIGHT = 220;
const PAD = { top: 16, right: 12, bottom: 28, left: 64 };
const MAX_COLUMN = 24;
const SEGMENT_GAP = 2;

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / (magnitude / 2)) * (magnitude / 2);
}

export function DailyGmvChart({ points }: { points: DailyPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  if (points.length === 0) {
    return (
      <p className="text-sm text-muted">Chưa có ca nào trong kỳ này để vẽ biểu đồ.</p>
    );
  }

  const width = Math.max(560, points.length * 56);
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const max = niceMax(
    Math.max(...points.map((point) => Math.max(point.agencyGmv + point.inhouseGmv, point.targetGmv ?? 0))),
  );
  const band = plotWidth / points.length;
  const columnWidth = Math.min(MAX_COLUMN, band * 0.55);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ratio * max);
  const y = (value: number) => PAD.top + plotHeight - (value / max) * plotHeight;
  const peak = points.reduce(
    (best, point, index) => (point.agencyGmv > points[best].agencyGmv ? index : best),
    0,
  );

  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-viz-agency" aria-hidden />
            Agency vận hành
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-viz-inhouse" aria-hidden />
            Brand tự live
          </span>
          <span className="flex items-center gap-2">
            <span className="h-0.5 w-4 bg-foreground" aria-hidden />
            Target ca
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm border border-attention" aria-hidden />
            Có doanh thu chưa quy kết
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowTable((current) => !current)}
          className="text-sm text-muted underline hover:text-foreground"
        >
          {showTable ? 'Xem biểu đồ' : 'Xem dạng bảng'}
        </button>
      </figcaption>

      {showTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="py-2 font-medium">Ngày</th>
              <th className="py-2 font-medium">Agency</th>
              <th className="py-2 font-medium">Brand tự live</th>
              <th className="py-2 font-medium">Target</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.date} className="border-b border-border last:border-0">
                <td className="tabular py-2">{point.label}</td>
                <td className="tabular py-2">{formatMoney(point.agencyGmv)}</td>
                <td className="tabular py-2">
                  {point.inhouseGmv === 0 ? '—' : formatMoney(point.inhouseGmv)}
                </td>
                <td className="tabular py-2">
                  {point.targetGmv === null ? '—' : formatMoney(point.targetGmv)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${HEIGHT}`}
            className="h-[220px] w-full min-w-[560px]"
            role="img"
            aria-label="GMV theo ngày, tách phần agency và phần brand tự live"
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="var(--viz-grid)"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={y(tick) + 4}
                  textAnchor="end"
                  className="tabular"
                  fontSize={11}
                  fill="var(--muted)"
                >
                  {formatMoneyCompact(tick)}
                </text>
              </g>
            ))}

            {points.map((point, index) => {
              const centre = PAD.left + band * index + band / 2;
              const left = centre - columnWidth / 2;
              const agencyTop = y(point.agencyGmv);
              const agencyHeight = Math.max(0, PAD.top + plotHeight - agencyTop);
              const inhouseHeight =
                point.inhouseGmv === 0
                  ? 0
                  : Math.max(0, (point.inhouseGmv / max) * plotHeight - SEGMENT_GAP);

              return (
                <g
                  key={point.date}
                  onPointerEnter={() => setHovered(index)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(index)}
                  onBlur={() => setHovered(null)}
                  tabIndex={0}
                  className="outline-none"
                >
                  {/* Hit target covers the whole band, not just the painted column. */}
                  <rect
                    x={PAD.left + band * index}
                    y={PAD.top}
                    width={band}
                    height={plotHeight}
                    fill="transparent"
                  />

                  {agencyHeight > 0 ? (
                    <rect
                      x={left}
                      y={agencyTop}
                      width={columnWidth}
                      height={agencyHeight}
                      rx={inhouseHeight > 0 ? 0 : 4}
                      fill="var(--viz-agency)"
                      opacity={hovered === null || hovered === index ? 1 : 0.55}
                    />
                  ) : null}

                  {inhouseHeight > 0 ? (
                    <rect
                      x={left}
                      y={agencyTop - inhouseHeight - SEGMENT_GAP}
                      width={columnWidth}
                      height={inhouseHeight}
                      rx={4}
                      fill="var(--viz-inhouse)"
                      opacity={hovered === null || hovered === index ? 1 : 0.55}
                    />
                  ) : null}

                  {point.targetGmv !== null ? (
                    <line
                      x1={left - 4}
                      x2={left + columnWidth + 4}
                      y1={y(point.targetGmv)}
                      y2={y(point.targetGmv)}
                      stroke="var(--foreground)"
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                  ) : null}

                  <text
                    x={centre}
                    y={HEIGHT - 10}
                    textAnchor="middle"
                    className="tabular"
                    fontSize={11}
                    fill="var(--muted)"
                  >
                    {point.label}
                  </text>

                  {/* A day whose figures could not be split has real revenue and
                      no height that would be honest to draw, so it is marked at
                      the baseline instead of left looking like a day with no sales. */}
                  {point.hasUnallocated ? (
                    <rect
                      x={left}
                      y={PAD.top + plotHeight - 10}
                      width={columnWidth}
                      height={10}
                      rx={2}
                      fill="none"
                      stroke="var(--attention)"
                      strokeWidth={1}
                    />
                  ) : null}

                  {/* One direct label, on the best day — never a number on every column. */}
                  {index === peak && point.agencyGmv > 0 ? (
                    <text
                      x={centre}
                      y={agencyTop - (inhouseHeight > 0 ? inhouseHeight + 12 : 8)}
                      textAnchor="middle"
                      className="tabular"
                      fontSize={11}
                      fontWeight={600}
                      fill="var(--foreground)"
                    >
                      {formatMoneyCompact(point.agencyGmv)}
                    </text>
                  ) : null}
                </g>
              );
            })}

            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={PAD.top + plotHeight}
              y2={PAD.top + plotHeight}
              stroke="var(--viz-axis)"
              strokeWidth={1}
            />
          </svg>

          {hovered !== null ? (
            <div className="pointer-events-none absolute left-0 top-0 w-full">
              <dl className="mx-auto w-fit rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-lg">
                <p className="tabular font-semibold">{points[hovered].label}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-0.5 w-3 bg-viz-agency" aria-hidden />
                  <dt className="text-muted">Agency</dt>
                  <dd className="tabular font-medium">{formatMoney(points[hovered].agencyGmv)}</dd>
                </div>
                {points[hovered].inhouseGmv > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="h-0.5 w-3 bg-viz-inhouse" aria-hidden />
                    <dt className="text-muted">Brand tự live</dt>
                    <dd className="tabular font-medium">
                      {formatMoney(points[hovered].inhouseGmv)}
                    </dd>
                  </div>
                ) : null}
                {points[hovered].targetGmv !== null ? (
                  <div className="flex items-center gap-2">
                    <span className="h-0.5 w-3 bg-foreground" aria-hidden />
                    <dt className="text-muted">Target</dt>
                    <dd className="tabular font-medium">
                      {formatMoney(points[hovered].targetGmv!)}
                    </dd>
                  </div>
                ) : null}
                {points[hovered].hasUnallocated ? (
                  <p className="mt-1 text-xs text-attention">
                    Ngày này còn doanh thu chưa quy kết được cho ca nào
                  </p>
                ) : null}
              </dl>
            </div>
          ) : null}
        </div>
      )}
    </figure>
  );
}
