import { BrandDashboardView } from '@/components/dashboard/brand-dashboard';
import { PageState } from '@/components/page-state';
import { buildBrandDashboard } from '@/lib/analytics/brand-dashboard';
import { loadDashboardRows } from '@/lib/analytics/load-dashboard';
import { loadAnalyticsSettings } from '@/lib/analytics/load-portfolio';
import { readPeriod } from '@/lib/filters/period';
import { createUserClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createUserClient();
  const params = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  // Brand và khoảng thời gian đọc từ URL, cùng một nguồn với thanh lọc ở khung
  // ứng dụng — nếu màn hình tự quyết định kỳ riêng thì người dùng đổi bộ lọc mà
  // số không đổi.
  const { data: brands } = await supabase
    .from('brands')
    .select('id,name')
    .eq('is_active', true)
    .order('name');

  const requested = one(params.brand);
  const brand = brands?.find((item) => item.id === requested) ?? brands?.[0];
  if (!brand) {
    return (
      <PageState title="Chưa có brand nào">
        Tài khoản của bạn chưa được gán brand nào. Nhờ Operation gán quyền.
      </PageState>
    );
  }

  const period = readPeriod({
    from: one(params.from),
    to: one(params.to),
    preset: one(params.preset),
  });

  const [{ rows, unallocatedGmv }, thresholds] = await Promise.all([
    loadDashboardRows(supabase, brand.id, period.from, period.to),
    loadAnalyticsSettings(supabase),
  ]);

  return (
    <BrandDashboardView
      brandName={brand.name}
      dashboard={buildBrandDashboard(rows, period.label, unallocatedGmv.amount, thresholds)}
    />
  );
}
