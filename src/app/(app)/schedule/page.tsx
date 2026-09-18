import { ScheduleBoard } from '@/components/schedule/schedule-board';
import { PageState } from '@/components/page-state';
import { loadStaffOptions, loadWeek } from '@/lib/planning/load-schedule';
import { buildSchedule, platformToday, weekDates } from '@/lib/planning/schedule-view';
import { createUserClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function shiftWeek(anchor: string, weeks: number): string {
  const day = new Date(`${anchor}T00:00:00Z`);
  return new Date(day.getTime() + weeks * 7 * 86_400_000).toISOString().slice(0, 10);
}

export default async function SchedulePage({ searchParams }: PageProps<'/schedule'>) {
  const params = await searchParams;
  const requested = typeof params.week === 'string' ? params.week : null;
  const anchor = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : platformToday();

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
    return <PageState title="Cần đăng nhập">Đăng nhập để xem lịch live.</PageState>;
  }

  const { data: accounts } = await supabase
    .from('platform_accounts')
    .select('id,brand_id,brands(name)')
    .order('account_name');

  const brands = (accounts ?? []).map((row) => {
    const brand = Array.isArray(row.brands) ? row.brands[0] : row.brands;
    return {
      brandId: row.brand_id as string,
      brandName: brand?.name ?? '',
      platformAccountId: row.id as string,
    };
  });

  const sessions = await loadWeek(supabase, anchor);
  const staff = brands[0] ? await loadStaffOptions(supabase, brands[0].brandId) : [];
  const week = weekDates(anchor);

  return (
    <ScheduleBoard
      days={buildSchedule(sessions, anchor, platformToday())}
      weekLabel={`${week[0].slice(8)}/${week[0].slice(5, 7)} – ${week[6].slice(8)}/${week[6].slice(5, 7)}`}
      previousWeek={shiftWeek(anchor, -1)}
      nextWeek={shiftWeek(anchor, 1)}
      brands={brands}
      staff={staff}
    />
  );
}
