import { z } from 'zod';

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serviceSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

/**
 * Read at call time rather than module load: a missing variable should fail the
 * request that needs it with a clear message, not the whole build.
 */
export function publicEnv() {
  const parsed = publicSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      'Thiếu cấu hình Supabase: NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY',
    );
  }
  return parsed.data;
}

export function serviceEnv() {
  const parsed = serviceSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error('Thiếu SUPABASE_SERVICE_ROLE_KEY (chỉ dùng phía server)');
  }
  return parsed.data;
}
