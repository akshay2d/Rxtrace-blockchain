import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveCompanyForUser } from '@/lib/company/resolve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cancel trial (company-level). No subscription row involved. */
export async function POST(req: NextRequest) {
  try {
    const { data: { user }, error: authErr } = await (await supabaseServer()).auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const resolved = await resolveCompanyForUser(supabase, user.id, 'id, trial_status');
    if (!resolved) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    if (!resolved.isOwner) {
      return NextResponse.json(
        { error: 'Only company owner can cancel trial.' },
        { status: 403 }
      );
    }

    if ((resolved.company as Record<string, unknown>).trial_status !== 'active') {
      return NextResponse.json({ error: 'No active trial to cancel' }, { status: 400 });
    }

    const { error: updateErr } = await supabase
      .from('companies')
      .update({
        trial_status: 'expired',
        subscription_status: 'expired',
      })
      .eq('id', resolved.companyId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'Trial cancelled' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to cancel trial' }, { status: 500 });
  }
}
