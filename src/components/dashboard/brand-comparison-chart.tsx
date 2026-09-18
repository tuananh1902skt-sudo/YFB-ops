'use client';

import { useState } from 'react';
import { formatMoneyCompact } from '@/lib/format';
import type { PortfolioBrandRow } from '@/lib/analytics/portfolio';

/**
 * GMV từng brand, xếp từ cao xuống thấp.
 *
 * Nằm ngang vì tên brand dài và số brand ít — cột dọc sẽ phải xoay nhãn.
 *
 * Một đại lượng duy nhất (đồng) trên một trục duy nhất. Phần chưa quy kết vẽ
 * **nối tiếp** thanh chứ không gộp vào thanh, và để rỗng có viền: nó là tiền có
 * thật nhưng không phải con số dùng để so sánh (docs/05 §10.1). Gộp vào sẽ khiến
 * brand nhiều tiền treo trông như bán tốt hơn.
 *
 * Target là vạch mốc trên cùng trục. Trục thứ hai sẽ khiến hai đại lượng khác
 * nhau trông như so sánh được.
 */
const ROW_HEIGHT = 44;
const BAR_HEIGHT = 22;
const SEGMENT_GAP = 2;
const PAD = { top: 8, right: 12, bottom: 28 };
const CHAR_WIDTH = 7.2;

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / (magnitude / 2)) * (magnitude / 2);
}

export function BrandComparisonChart({ brands }: { brands: PortfolioBrandRow[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  if (brands.length === 0) {
    return <p className="text-sm text-muted">Chưa có brand nào trong kỳ này để so sánh.</p>;
  }

  // Chừa chỗ cho nhãn thay vì cắt cụt nó: đo bằng số ký tự của chuỗi dài nhất.
  const nameWidth = Math.min(
    180,
    Math.max(80, ...brands.map((brand) => brand.brandName.length * CHAR_WIDTH + 12)),
  );
  const valueWidth = Math.max(...brands.map((brand) => brand.gmvDisplay.length * CHAR_WIDTH)) + 16;

  // Đặt sát bề rộng thật của khung để SVG không bị phóng to: phóng lên thì thanh
  // vượt mức 24px, mà 24px là ngưỡng giữ cho thanh mảnh chứ không lấp đầy hàng.
  const width = 1000;
  const height = PAD.top + brands.length * ROW_HEIGHT + PAD.bottom;
  const plotLeft = nameWidth;
  const plotWidth = width - plotLeft - valueWidth - PAD.right;
  const max = niceMax(
    Math.max(
      ...brands.map((brand) =>
        Math.max(brand.gmv + brand.unallocatedGmv, brand.targetGmv ?? 0),
      ),
    ),
  );
  const ticks = [0, 0.5, 1].map((ratio) => ratio * max);
  const x = (value: number) => (value / max) * plotWidth;

  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-viz-agency" aria-hidden />
            GMV đã quy kết
          </span>
          <span className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-sm border border-attention bg-attention-surface"
              aria-hidden
            />
            Chưa quy kết được
          </span>
          <span className="flex items-center gap-2">
            <span className="h-4 w-0.5 bg-foreground" aria-hidden />
            Target
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
              <th className="py-2 font-medium">Brand</th>
              <th className="py-2 font-medium">GMV đã quy kết</th>
              <th className="py-2 font-medium">Chưa quy kết</th>
              <th className="py-2 font-medium">Target</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((brand) => (
              <tr key={brand.brandId} className="border-b border-border last:border-0">
                <td className="py-2">{brand.brandName}</td>
                <td className="tabular py-2">{brand.gmvDisplay}</td>
                <td className="tabular py-2">{brand.unallocatedDisplay ?? '—'}</td>
                <td className="tabular py-2">{brand.targetDisplay}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full min-w-[640px]"
            style={{ height }}
            role="img"
            aria-label="GMV từng brand, kèm phần chưa quy kết và mốc target"
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={plotLeft + x(tick)}
                  x2={plotLeft + x(tick)}
                  y1={PAD.top}
                  y2={height - PAD.bottom}
                  stroke="var(--viz-grid)"
                  strokeWidth={1}
                />
                <text
                  x={plotLeft + x(tick)}
                  y={height - PAD.bottom + 16}
                  textAnchor={tick === 0 ? 'start' : 'middle'}
                  className="tabular"
                  fontSize={11}
                  fill="var(--muted)"
                >
                  {formatMoneyCompact(tick)}
                </text>
              </g>
            ))}

            {brands.map((brand, index) => {
              const top = PAD.top + index * ROW_HEIGHT;
              const barTop = top + (ROW_HEIGHT - BAR_HEIGHT) / 2;
              const barWidth = x(brand.gmv);
              const unallocatedWidth = brand.unallocatedGmv === 0 ? 0 : x(brand.unallocatedGmv);
              const unallocatedEnd =
                unallocatedWidth > 0 ? barWidth + SEGMENT_GAP + Math.max(3, unallocatedWidth - SEGMENT_GAP) : barWidth;
              // Nhãn bám vào đầu xa nhất của hàng, kể cả khi vạch target còn xa hơn.
              const markEnd = Math.max(unallocatedEnd, brand.targetGmv === null ? 0 : x(brand.targetGmv));
              const dimmed = hovered !== null && hovered !== brand.brandId;

              return (
                <g
                  key={brand.brandId}
                  onPointerEnter={() => setHovered(brand.brandId)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(brand.brandId)}
                  onBlur={() => setHovered(null)}
                  tabIndex={0}
                  className="outline-none"
                >
                  <rect x={0} y={top} width={width} height={ROW_HEIGHT} fill="transparent" />

                  <text
                    x={plotLeft - 12}
                    y={barTop + BAR_HEIGHT / 2 + 4}
                    textAnchor="end"
                    fontSize={12}
                    fill="var(--foreground)"
                  >
                    {brand.brandName}
                  </text>

                  {barWidth > 0 ? (
                    <rect
                      x={plotLeft}
                      y={barTop}
                      width={barWidth}
                      height={BAR_HEIGHT}
                      rx={4}
                      fill="var(--viz-agency)"
                      opacity={dimmed ? 0.55 : 1}
                    />
                  ) : null}

                  {unallocatedWidth > 0 ? (
                    <rect
                      x={plotLeft + barWidth + SEGMENT_GAP}
                      y={barTop}
                      width={Math.max(3, unallocatedWidth - SEGMENT_GAP)}
                      height={BAR_HEIGHT}
                      rx={4}
                      fill="var(--attention-surface)"
                      stroke="var(--attention)"
                      strokeWidth={1}
                      opacity={dimmed ? 0.55 : 1}
                    />
                  ) : null}

                  {brand.targetGmv === null ? null : (
                    <g>
                      {/* Viền nền để vạch target vẫn đọc được ở chỗ nó đè lên thanh. */}
                      <line
                        x1={plotLeft + x(brand.targetGmv)}
                        x2={plotLeft + x(brand.targetGmv)}
                        y1={barTop - 5}
                        y2={barTop + BAR_HEIGHT + 5}
                        stroke="var(--surface)"
                        strokeWidth={6}
                      />
                      <line
                        x1={plotLeft + x(brand.targetGmv)}
                        x2={plotLeft + x(brand.targetGmv)}
                        y1={barTop - 4}
                        y2={barTop + BAR_HEIGHT + 4}
                        stroke="var(--foreground)"
                        strokeWidth={2}
                      />
                    </g>
                  )}

                  {/* Nhãn đặt ngay sau đầu thanh, không dồn về mép phải: một con số
                      cách thanh nửa màn hình sẽ không còn đọc như của thanh đó. */}
                  <text
                    x={plotLeft + markEnd + 8}
                    y={barTop + BAR_HEIGHT / 2 + 4}
                    textAnchor="start"
                    className="tabular"
                    fontSize={12}
                    fill="var(--foreground)"
                  >
                    {brand.gmvDisplay}
                  </text>
                </g>
              );
            })}
          </svg>

          {hovered !== null
            ? (() => {
                const brand = brands.find((item) => item.brandId === hovered)!;
                return (
                  <div className="pointer-events-none absolute right-3 top-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-sm">
                    <p className="font-medium">{brand.brandName}</p>
                    <p className="tabular mt-1 text-muted">GMV đã quy kết {brand.gmvDisplay}</p>
                    {brand.unallocatedDisplay ? (
                      <p className="tabular text-attention">
                        Chưa quy kết {brand.unallocatedDisplay}
                      </p>
                    ) : null}
                    <p className="tabular text-muted">
                      Target {brand.targetDisplay} · đạt {brand.achievementDisplay}
                    </p>
                  </div>
                );
              })()
            : null}
        </div>
      )}
    </figure>
  );
}
