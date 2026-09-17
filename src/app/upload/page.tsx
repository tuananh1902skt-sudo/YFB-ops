import { UploadScreen } from '@/components/upload/upload-screen';
import { formatDate, formatTime } from '@/lib/format';
import { createUserClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const DEFAULT_GRACE_MINUTES = 30;

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-base text-muted">{children}</p>
    </main>
  );
}

export default async function UploadPage() {
  let supabase;
  try {
    supabase = await createUserClient();
  } catch {
    return (
      <Empty title="Hệ thống chưa được cấu hình">
        Chưa có kết nối tới Supabase. Liên hệ quản trị hệ thống để điền biến môi trường.
      </Empty>
    );
  }

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return <Empty title="Cần đăng nhập">Đăng nhập bằng tài khoản YFB để nộp dữ liệu ca.</Empty>;
  }

  const { data: accounts } = await supabase
    .from('platform_accounts')
    .select('id,account_name,brands(name)')
    .order('account_name');

  const account = accounts?.[0];
  if (!account) {
    return (
      <Empty title="Chưa có tài khoản nền tảng nào">
        Tài khoản của bạn chưa được gán brand nào. Nhờ Operation gán quyền trước khi nộp dữ liệu.
      </Empty>
    );
  }

  // The shift this upload most likely belongs to: the latest one still waiting
  // for its data. The assistant can still submit a file that turns out to cover
  // a different shift — the engine decides from the timestamps, not from this.
  const { data: shifts } = await supabase
    .from('live_sessions')
    .select('id,session_date,planned_start_at,planned_end_at,actual_start_at,actual_end_at,status')
    .eq('platform_account_id', account.id)
    .in('status', ['LIVE', 'DATA_PENDING', 'DATA_PARTIAL'])
    .order('session_date', { ascending: false })
    .limit(1);

  const shift = shifts?.[0];
  const endedAt = shift?.actual_end_at ?? shift?.planned_end_at ?? null;

  const { data: settings } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'data_submission_grace_minutes')
    .maybeSingle();

  const brand = Array.isArray(account.brands) ? account.brands[0] : account.brands;

  return (
    <UploadScreen
      platformAccountId={account.id}
      brandName={brand?.name ?? account.account_name}
      shiftTitle={
        shift
          ? `Ca ${formatDate(new Date(shift.session_date))}${endedAt ? ` · kết thúc ${formatTime(new Date(endedAt))}` : ''}`
          : 'Chưa gắn với ca nào'
      }
      shiftEndedAt={endedAt}
      graceMinutes={Number(settings?.value ?? DEFAULT_GRACE_MINUTES)}
    />
  );
}
