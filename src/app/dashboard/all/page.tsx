import { PortfolioDashboardView } from '@/components/dashboard/portfolio-dashboard';
import { PageState } from '@/components/page-state';
import { loadAnalyticsSettings, loadPortfolioInputs } from '@/lib/analytics/load-portfolio';
import { buildPortfolio } from '@/lib/analytics/portfolio';
import { platformToday } from '@/lib/planning/schedule-view';
import { createUserClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
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
    return <PageState title="Cần đăng nhập">Đăng nhập để xem kết quả toàn bộ brand.</PageState>;
  }

  const today = platformToday();
  const from = `${today.slice(0, 8)}01`;

  const [inputs, thresholds] = await Promise.all([
    loadPortfolioInputs(supabase, from, today),
    loadAnalyticsSettings(supabase),
  ]);

  if (inputs.length === 0) {
    return (
      <PageState title="Chưa có brand nào">
        Tài khoản của bạn chưa được gán brand nào. Nhờ Operation gán quyền.
      </PageState>
    );
  }

  return (
    <PortfolioDashboardView
      portfolio={buildPortfolio(
        inputs,
        `tháng ${today.slice(5, 7)}/${today.slice(0, 4)}`,
        thresholds,
      )}
    />
  );
}
