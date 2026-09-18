import type { SupabaseClient } from '@supabase/supabase-js';
import type { BrandOption } from '@/components/shell/filter-bar';
import { readPeriod, type Period } from '../filters/period';
import type { UserRoleCode } from '../setup/seed-config';

/**
 * Mọi thứ khung ứng dụng cần biết về người đang đăng nhập và phạm vi họ đang xem.
 *
 * Đọc một lần ở layout rồi truyền xuống, thay vì mỗi màn hình tự hỏi lại — hai
 * đường đọc khác nhau cho cùng một thứ là cách chắc chắn nhất để hai chỗ hiện
 * hai kết quả khác nhau.
 */
export interface ShellContext {
  userId: string;
  fullName: string;
  email: string;
  roles: UserRoleCode[];
  brands: BrandOption[];
  activeBrand: BrandOption | null;
  period: Period;
}

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function loadShellContext(
  supabase: SupabaseClient,
  userId: string,
  email: string,
  searchParams: SearchParams,
): Promise<ShellContext> {
  const [profile, roleRows, brandRows] = await Promise.all([
    supabase.from('users').select('full_name').eq('id', userId).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', userId),
    supabase.from('brands').select('id,name').eq('is_active', true).order('name'),
  ]);
  fail('đọc hồ sơ', profile.error);
  fail('đọc vai trò', roleRows.error);
  fail('đọc brand', brandRows.error);

  const brands: BrandOption[] = (brandRows.data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
  }));

  const requested = one(searchParams.brand);
  const activeBrand = brands.find((brand) => brand.id === requested) ?? brands[0] ?? null;

  return {
    userId,
    email,
    fullName: (profile.data?.full_name as string | undefined) ?? email,
    roles: (roleRows.data ?? []).map((row) => row.role as UserRoleCode),
    brands,
    activeBrand,
    period: readPeriod({
      from: one(searchParams.from),
      to: one(searchParams.to),
      preset: one(searchParams.preset),
    }),
  };
}
