import { PortfolioDashboardView } from '@/components/dashboard/portfolio-dashboard';
import { buildPortfolio } from '@/lib/analytics/portfolio';
import { buildPortfolioDemo } from '@/lib/ingest/demo-scenarios';

export const metadata = { title: 'Xem trước dashboard tổng hợp' };

export default async function DemoPortfolioPage() {
  const inputs = await buildPortfolioDemo();
  return <PortfolioDashboardView portfolio={buildPortfolio(inputs, 'tuần 08–13/09')} />;
}
