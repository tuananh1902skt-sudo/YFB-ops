/**
 * Icon vẽ tay bằng SVG, nét 1.5px đồng bộ với độ đậm của chữ.
 *
 * Không dùng thư viện icon: bộ này chỉ có 12 hình, mà thêm một dependency đồng
 * nghĩa với một nguồn nữa có thể lệch phong cách khi nâng cấp.
 */
const PATHS: Record<string, string> = {
  command: 'M4 6h16M4 12h16M4 18h10',
  calendar: 'M7 4v3M17 4v3M4 10h16M5 7h14a1 1 0 011 1v11a1 1 0 01-1 1H5a1 1 0 01-1-1V8a1 1 0 011-1z',
  hand: 'M9 11V6a1.5 1.5 0 013 0v5m0-3a1.5 1.5 0 013 0v3m0-1a1.5 1.5 0 013 0v5a6 6 0 01-6 6h-1a6 6 0 01-6-6v-4a1.5 1.5 0 013 0',
  alert: 'M12 9v4m0 3h.01M10.3 4.3L2.6 17.6A2 2 0 004.3 20.6h15.4a2 2 0 001.7-3L13.7 4.3a2 2 0 00-3.4 0z',
  upload: 'M12 15V4m0 0L8 8m4-4l4 4M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2',
  split: 'M4 6h5l4 6 4 6h3M20 6h-3l-2 3M17 18l3-3M17 18l3 3M17 6l3-3M17 6l3 3',
  check: 'M4 12l5 5L20 6',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9',
  coin: 'M12 4c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
};

export function NavIcon({ name, className = '' }: { name: string; className?: string }) {
  const path = PATHS[name] ?? PATHS.command;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-[18px] w-[18px] shrink-0 ${className}`}
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}
