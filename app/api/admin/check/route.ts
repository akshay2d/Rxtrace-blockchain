// GET: Check if current user is recognized as admin (for debugging "Admin access required")
// Does NOT require admin - call this while logged in to see what the server sees.
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/admin';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        ok: false,
        isAdmin: false,
        userId: null,
        email: null,
        message: 'Not signed in. Sign in and try again.',
      });
    }

    const adminStatus = await isAdmin(user.id);
    return NextResponse.json({
      ok: true,
      isAdmin: adminStatus,
      userId: user.id,
      email: user.email ?? null,
      message: adminStatus
        ? 'You are recognized as admin. Remove discount and other admin actions should work.'
        : 'You are NOT recognized as admin. Set is_admin in Supabase (see docs/ADMIN_ACCESS_FIX.md), then sign out and sign in again.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: false,
      isAdmin: false,
      userId: null,
      email: null,
      message: 'Check failed: ' + message,
    }, { status: 500 });
  }
}
