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
    const resolved = await resolveCompanyForUser(supabase, user.id, 'id');
    if (!resolved) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    if (!resolved.isOwner) {
      return NextResponse.json(
        { error: 'Only company owner can cancel trial.' },
        { status: 403 }
      );
    }

    const { data: trialRow, error: trialError } = await supabase
      .from('company_trials')
      .select('id, ends_at')
      .eq('company_id', resolved.companyId)
      .maybeSingle();
    if (trialError) {
      return NextResponse.json({ error: trialError.message }, { status: 500 });
    }
    if (!trialRow || new Date(trialRow.ends_at) <= new Date()) {
      return NextResponse.json({ error: 'No active trial to cancel' }, { status: 400 });
    }

    const { error: updateErr } = await supabase
      .from('company_trials')
      .update({
        ends_at: new Date().toISOString(),
      })
      .eq('id', trialRow.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'Trial cancelled' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to cancel trial' }, { status: 500 });
  }
}
