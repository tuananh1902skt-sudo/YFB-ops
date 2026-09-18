import type { UserRoleCode } from '../setup/seed-config';

/**
 * Điều hướng cố định của hệ thống (master prompt §42 "Command Center").
 *
 * Hai quyết định:
 *
 * Giấu theo vai trò **không phải là phân quyền** — RLS mới là chốt chặn. Giấu
 * link là để người dùng không bấm vào rồi gặp trang trống và tưởng hệ thống hỏng.
 *
 * Module chưa build vẫn hiện, nhưng mờ và ghi rõ "sắp có". Bỏ hẳn khỏi menu sẽ
 * khiến người dùng tưởng hệ thống không làm được; để link dẫn vào trang trống thì
 * tệ hơn nữa. Nói thẳng là lựa chọn còn lại.
 */

export interface NavItem {
  href: string;
  label: string;
  description: string;
  /** Tên icon, vẽ ở `components/shell/nav-icon.tsx`. */
  icon: string;
  roles: readonly UserRoleCode[];
  /** false = chưa build, hiện mờ kèm nhãn. */
  available?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

const ALL: UserRoleCode[] = [
  'SUPER_ADMIN',
  'MANAGEMENT',
  'ACCOUNT',
  'OPERATION',
  'HOST',
  'ASSISTANT',
  'DATA_ANALYST',
  'FINANCE',
];

const GROUPS: NavGroup[] = [
  {
    title: 'Điều hành',
    items: [
      {
        href: '/',
        label: 'Trung tâm điều hành',
        description: 'Hôm nay cần xử lý gì',
        icon: 'command',
        roles: ALL,
      },
      {
        href: '/schedule',
        label: 'Lịch live',
        description: 'Lịch theo tuần, tạo ca và phân người',
        icon: 'calendar',
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'ACCOUNT', 'OPERATION', 'HOST', 'ASSISTANT'],
      },
      {
        href: '/shifts',
        label: 'Ca đang mở',
        description: 'Đăng ký ca còn trống',
        icon: 'hand',
        roles: ['SUPER_ADMIN', 'ACCOUNT', 'OPERATION', 'HOST', 'ASSISTANT'],
      },
      {
        href: '/operations',
        label: 'Cần xử lý',
        description: 'Hàng đợi việc đang chặn số liệu',
        icon: 'alert',
        roles: ['SUPER_ADMIN', 'ACCOUNT', 'OPERATION'],
      },
    ],
  },
  {
    title: 'Dữ liệu',
    items: [
      {
        href: '/upload',
        label: 'Nộp dữ liệu ca',
        description: 'Tải report cuối ca, xem trước phần được tách',
        icon: 'upload',
        roles: ['SUPER_ADMIN', 'OPERATION', 'HOST', 'ASSISTANT'],
      },
      {
        href: '/operations/ownership',
        label: 'Xác nhận ownership',
        description: 'Agency hay brand tự live',
        icon: 'split',
        roles: ['SUPER_ADMIN', 'OPERATION'],
      },
      {
        href: '/operations/bookings',
        label: 'Duyệt đăng ký ca',
        description: 'Duyệt hoặc từ chối người đăng ký',
        icon: 'check',
        roles: ['SUPER_ADMIN', 'ACCOUNT', 'OPERATION'],
      },
    ],
  },
  {
    title: 'Phân tích',
    items: [
      {
        href: '/dashboard',
        label: 'Kết quả brand',
        description: 'GMV so target, agency và brand tự live tách riêng',
        icon: 'chart',
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'ACCOUNT', 'OPERATION', 'DATA_ANALYST', 'FINANCE'],
      },
      {
        href: '/dashboard/all',
        label: 'Toàn bộ brand',
        description: 'So sánh giữa các brand',
        icon: 'grid',
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'DATA_ANALYST', 'FINANCE'],
      },
    ],
  },
  {
    title: 'Sắp có',
    items: [
      {
        href: '/forecast',
        label: 'Dự báo & target',
        description: 'Gợi ý target theo lịch sử, uplift campaign',
        icon: 'trend',
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'ACCOUNT', 'DATA_ANALYST'],
        available: false,
      },
      {
        href: '/products',
        label: 'Sản phẩm / SKU',
        description: 'Chờ nguồn export có dữ liệu SKU',
        icon: 'box',
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'ACCOUNT', 'DATA_ANALYST'],
        available: false,
      },
      {
        href: '/finance',
        label: 'Doanh thu agency',
        description: 'Hợp đồng, chi phí, lợi nhuận theo client',
        icon: 'coin',
        roles: ['SUPER_ADMIN', 'MANAGEMENT', 'FINANCE'],
        available: false,
      },
    ],
  },
];

export function navFor(roles: readonly UserRoleCode[]): NavGroup[] {
  const held = new Set(roles);
  return GROUPS.map((group) => ({
    title: group.title,
    items: group.items.filter((item) => item.roles.some((role) => held.has(role))),
  })).filter((group) => group.items.length > 0);
}

/**
 * Mục đang mở, chọn theo tiền tố khớp dài nhất — nếu không `/dashboard` sẽ sáng
 * cùng lúc với `/dashboard/all`.
 */
export function activeHref(groups: NavGroup[], pathname: string): string | null {
  const candidates = groups
    .flatMap((group) => group.items)
    .filter((item) => item.href === pathname || pathname.startsWith(`${item.href}/`))
    .map((item) => item.href);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, href) => (href.length > best.length ? href : best));
}
