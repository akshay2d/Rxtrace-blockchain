import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdmin() {
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
  if (!serviceKey) {
    throw new Error('Missing Supabase service key env var (SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY)');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
