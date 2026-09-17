import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { publicEnv, serviceEnv } from './env';

/**
 * Bypasses row level security, so it is used only for what the attribution
 * engine derives — figures nobody types in. Whether the person may upload for
 * this account is checked before this client is ever reached.
 */
export function createServiceClient() {
  const env = publicEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
