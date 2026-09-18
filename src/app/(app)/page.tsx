import { CommandCenterView } from '@/components/command-center/command-center';
import { loadCommandCenter } from '@/lib/command-center/load';
import { createUserClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Layout đã chặn người chưa đăng nhập, nên tới đây chắc chắn có phiên. */
export default async function CommandCenterPage() {
  const supabase = await createUserClient();
  return <CommandCenterView center={await loadCommandCenter(supabase)} />;
}
