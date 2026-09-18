import type { UserRoleCode } from '../setup/seed-config';

/**
 * Trang chủ hiện đúng những màn hình người này dùng được, suy từ vai trò.
 *
 * Đây là chỉ dẫn, không phải phân quyền: chốt chặn thật nằm ở RLS. Giấu một link
 * không bảo vệ được gì, nhưng hiện một link dẫn tới màn hình trống thì làm người
 * dùng tưởng hệ thống hỏng.
 */
export interface NavLink {
  href: string;
  label: string;
  description: string;
}

const LINKS: (NavLink & { roles: readonly UserRoleCode[] })[] = [
  {
    href: '/upload',
    label: 'Nộp dữ liệu ca',
    description: 'Tải report cuối ca, xem trước phần được tách rồi mới lưu.',
    roles: ['ASSISTANT', 'HOST', 'OPERATION', 'SUPER_ADMIN'],
  },
  {
    href: '/shifts',
    label: 'Ca đang mở',
    description: 'Đăng ký ca còn trống.',
    roles: ['ASSISTANT', 'HOST', 'OPERATION', 'ACCOUNT', 'SUPER_ADMIN'],
  },
  {
    href: '/schedule',
    label: 'Lịch live',
    description: 'Lịch theo tuần, tạo ca và phân người.',
    roles: ['ASSISTANT', 'HOST', 'OPERATION', 'ACCOUNT', 'MANAGEMENT', 'SUPER_ADMIN'],
  },
  {
    href: '/operations',
    label: 'Cần xử lý',
    description: 'Hàng đợi việc đang chặn số liệu.',
    roles: ['OPERATION', 'ACCOUNT', 'SUPER_ADMIN'],
  },
  {
    href: '/operations/ownership',
    label: 'Đoạn live chưa rõ ai vận hành',
    description: 'Xác nhận agency hay brand tự live.',
    roles: ['OPERATION', 'SUPER_ADMIN'],
  },
  {
    href: '/operations/bookings',
    label: 'Duyệt đăng ký ca',
    description: 'Duyệt hoặc từ chối người đăng ký.',
    roles: ['OPERATION', 'ACCOUNT', 'SUPER_ADMIN'],
  },
  {
    href: '/dashboard/all',
    label: 'Kết quả toàn bộ brand',
    description: 'So sánh giữa các brand và danh sách việc cần xem.',
    roles: ['MANAGEMENT', 'DATA_ANALYST', 'FINANCE', 'SUPER_ADMIN'],
  },
  {
    href: '/dashboard',
    label: 'Kết quả brand',
    description: 'GMV so target, agency và brand tự live tách riêng.',
    roles: ['MANAGEMENT', 'ACCOUNT', 'DATA_ANALYST', 'FINANCE', 'OPERATION', 'SUPER_ADMIN'],
  },
];

export function linksFor(roles: readonly UserRoleCode[]): NavLink[] {
  const held = new Set(roles);
  return LINKS.filter((link) => link.roles.some((role) => held.has(role))).map(
    ({ href, label, description }) => ({ href, label, description }),
  );
}
