import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdmin() {
  const nextRuntime = process.env.NEXT_RUNTIME;

  const supabaseUrl =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  const serviceKey =
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.SUPABASE_SERVICE ??
    undefined;

  if (!supabaseUrl) {
    throw new Error('Missing Supabase URL env var (SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL)');
  }
  const normalizedServiceKey = typeof serviceKey === 'string' ? serviceKey.trim() : '';
  if (!normalizedServiceKey) {
    if (nextRuntime === 'edge') {
      throw new Error(
        "Missing Supabase service key env var (SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY). This route appears to be running in Edge runtime; set `export const runtime = 'nodejs'` in the route handler."
      );
    }
    throw new Error('Missing Supabase service key env var (SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY)');
  }

  return createClient(supabaseUrl, normalizedServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
