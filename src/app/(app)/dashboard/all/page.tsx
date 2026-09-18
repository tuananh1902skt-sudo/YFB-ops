import { PortfolioDashboardView } from '@/components/dashboard/portfolio-dashboard';
import { PageState } from '@/components/page-state';
import { loadAnalyticsSettings, loadPortfolioInputs } from '@/lib/analytics/load-portfolio';
import { buildPortfolio } from '@/lib/analytics/portfolio';
import { readPeriod } from '@/lib/filters/period';
import { createUserClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createUserClient();
  const params = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  // Cố ý bỏ qua bộ lọc brand: màn hình này tồn tại để so sánh giữa các brand.
  const period = readPeriod({
    from: one(params.from),
    to: one(params.to),
    preset: one(params.preset),
  });

  const [inputs, thresholds] = await Promise.all([
    loadPortfolioInputs(supabase, period.from, period.to),
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
    <PortfolioDashboardView portfolio={buildPortfolio(inputs, period.label, thresholds)} />
  );
}
