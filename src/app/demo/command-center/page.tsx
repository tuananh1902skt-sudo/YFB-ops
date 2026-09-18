import { CommandCenterView } from '@/components/command-center/command-center';
import { AppShell } from '@/components/shell/app-shell';
import { presetPeriod } from '@/lib/filters/period';
import { buildCommandCenterDemo } from '@/lib/ingest/demo-scenarios';

export const metadata = { title: 'Xem trước trung tâm điều hành' };

/** Dựng luôn cả khung ứng dụng, vì khung mới là thứ cần nhìn ở đây. */
export default async function DemoCommandCenterPage() {
  const brands = [
    { id: 'franklin', name: 'Franklin' },
    { id: 'be-hive', name: 'Be Hive' },
  ];

  return (
    <AppShell
      context={{
        userId: 'demo',
        email: 'demo@yfb.test',
        fullName: 'Huỳnh Tuấn Anh',
        roles: ['SUPER_ADMIN'],
        brands,
        activeBrand: brands[0],
        period: presetPeriod('THIS_MONTH', '2026-09-18'),
      }}
      showFilters
    >
      <CommandCenterView center={await buildCommandCenterDemo()} />
    </AppShell>
  );
}
