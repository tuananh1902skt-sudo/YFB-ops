import { BrandDashboardView } from '@/components/dashboard/brand-dashboard';
import { PageState } from '@/components/page-state';
import { buildBrandDashboard } from '@/lib/analytics/brand-dashboard';
import { loadDashboardRows } from '@/lib/analytics/load-dashboard';
import { loadAnalyticsSettings } from '@/lib/analytics/load-portfolio';
import { platformToday } from '@/lib/planning/schedule-view';
import { createUserClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let supabase;
  try {
    supabase = await createUserClient();
  } catch {
    return (
      <PageState title="Hệ thống chưa được cấu hình">
        Chưa có kết nối tới Supabase. Liên hệ quản trị hệ thống để điền biến môi trường.
      </PageState>
    );
  }

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return <PageState title="Cần đăng nhập">Đăng nhập để xem kết quả brand.</PageState>;
  }

  const { data: brands } = await supabase.from('brands').select('id,name').order('name').limit(1);
  const brand = brands?.[0];
  if (!brand) {
    return (
      <PageState title="Chưa có brand nào">
        Tài khoản của bạn chưa được gán brand nào. Nhờ Operation gán quyền.
      </PageState>
    );
  }

  const today = platformToday();
  const from = `${today.slice(0, 8)}01`;
  const [{ rows, unallocatedGmv }, thresholds] = await Promise.all([
    loadDashboardRows(supabase, brand.id, from, today),
    loadAnalyticsSettings(supabase),
  ]);

  return (
    <BrandDashboardView
      brandName={brand.name}
      dashboard={buildBrandDashboard(
        rows,
        `tháng ${today.slice(5, 7)}/${today.slice(0, 4)}`,
        unallocatedGmv.amount,
        thresholds,
      )}
    />
  );
}
