import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveCompanyForUser } from '@/lib/company/resolve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Resume trial (company-level). Separate from subscription resume. */
export async function POST() {
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
        { error: 'Only company owner can resume trial.' },
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

    if (!trialRow || new Date(trialRow.ends_at) > new Date()) {
      return NextResponse.json({ error: 'No expired trial to resume' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Trial has ended. Subscribe to continue.' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
