import { BrandDashboardView } from '@/components/dashboard/brand-dashboard';
import { buildBrandDashboard } from '@/lib/analytics/brand-dashboard';
import { buildDashboardDemo } from '@/lib/ingest/demo-scenarios';

export const metadata = { title: 'Xem trước dashboard brand' };

export default async function DemoDashboardPage() {
  const { rows, unallocatedGmv } = await buildDashboardDemo();
  return (
    <BrandDashboardView
      brandName="FRANKLIN · bản xem thử thiết kế"
      dashboard={buildBrandDashboard(rows, 'tuần 08–13/09', unallocatedGmv)}
    />
  );
}
