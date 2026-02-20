import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveCompanyForUser } from '@/lib/company/resolve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeTrialStatusErrorResponse() {
  return NextResponse.json(
    { error: 'Failed to load trial status' },
    { status: 500 }
  );
}

export async function GET() {
  try {
    const {
      data: { user },
      error: authError,
    } = await (await supabaseServer()).auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const resolved = await resolveCompanyForUser(admin, user.id, 'id');
    if (!resolved) {
      return NextResponse.json({ subscription: null });
    }

    const { data: trialRow, error: trialError } = await admin
      .from('company_trials')
      .select('id, company_id, started_at, ends_at')
      .eq('company_id', resolved.companyId)
      .maybeSingle();

    if (trialError) {
      throw trialError;
    }

    if (!trialRow) {
      return NextResponse.json({ subscription: null });
    }

    const now = new Date();
    const endsAt = new Date(trialRow.ends_at);
    const active = endsAt > now;

    return NextResponse.json({
      subscription: {
        id: `trial-${trialRow.company_id}`,
        company_id: trialRow.company_id,
        status: active ? 'trialing' : 'EXPIRED',
        trial_end: trialRow.ends_at,
      },
    });
  } catch (error: any) {
    console.error('[trial/status] error', error);
    return safeTrialStatusErrorResponse();
  }
}
