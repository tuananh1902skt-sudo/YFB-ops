import type { SupabaseClient } from '@supabase/supabase-js';
import { loadDashboardRows } from './load-dashboard';
import type { BrandPeriodInput } from './portfolio';
import { readAnalyticsSettings, type AnalyticsThresholds } from './settings';

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

/** Ngưỡng do Operation đặt, không phải số cứng trong code (CLAUDE.md §12). */
export async function loadAnalyticsSettings(
  supabase: SupabaseClient,
): Promise<AnalyticsThresholds> {
  const { data, error } = await supabase.from('system_settings').select('key,value');
  fail('đọc ngưỡng hệ thống', error);
  const stored = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
  return readAnalyticsSettings(stored);
}

/**
 * Dữ liệu kỳ này của mọi brand người dùng được phép xem.
 *
 * Đọc từng brand một qua đúng `loadDashboardRows` mà dashboard brand dùng, thay
 * vì viết một câu query gộp riêng: hai đường đọc khác nhau cho cùng một con số
 * là cách chắc chắn nhất để hai màn hình hiện hai số khác nhau.
 *
 * Số brand ở quy mô này là một con số nhỏ. Khi nào nó không còn nhỏ thì đây là
 * chỗ đầu tiên phải đổi, chứ không phải chỗ sửa vội bằng cách nhân bản query.
 */
export async function loadPortfolioInputs(
  supabase: SupabaseClient,
  from: string,
  to: string,
): Promise<BrandPeriodInput[]> {
  const { data, error } = await supabase.from('brands').select('id,name').order('name');
  fail('đọc danh sách brand', error);

  const brands = data ?? [];
  return Promise.all(
    brands.map(async (brand) => {
      const { rows, unallocatedGmv } = await loadDashboardRows(supabase, brand.id, from, to);
      return {
        brandId: brand.id as string,
        brandName: brand.name as string,
        rows,
        unallocatedGmv: unallocatedGmv.amount,
      };
    }),
  );
}
