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
    const resolved = await resolveCompanyForUser(supabase, user.id, 'id, trial_status, trial_ends_at, subscription_status');
    if (!resolved) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    if (!resolved.isOwner) {
      return NextResponse.json(
        { error: 'Only company owner can resume trial.' },
        { status: 403 }
      );
    }

    const company = resolved.company as Record<string, unknown>;
    const trialStatus = company.trial_status as string | null;
    const trialEndsAt = company.trial_ends_at as string | null;

    if (trialStatus !== 'expired') {
      return NextResponse.json({ error: 'No expired trial to resume' }, { status: 400 });
    }

    if (!trialEndsAt || new Date(trialEndsAt) <= new Date()) {
      return NextResponse.json({ error: 'Trial has ended. Subscribe to continue.' }, { status: 400 });
    }

    const { error: updateErr } = await supabase
      .from('companies')
      .update({
        trial_status: 'active',
        subscription_status: 'trial',
        updated_at: new Date().toISOString(),
      })
      .eq('id', resolved.companyId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'Trial resumed' });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
