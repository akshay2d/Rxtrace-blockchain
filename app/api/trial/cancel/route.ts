import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

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
    const { data: company } = await supabase
      .from('companies')
      .select('id, trial_status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    if ((company as any).trial_status !== 'active') {
      return NextResponse.json({ error: 'No active trial to cancel' }, { status: 400 });
    }

    const { error: updateErr } = await supabase
      .from('companies')
      .update({
        trial_status: 'expired',
        subscription_status: 'expired',
      })
      .eq('id', (company as any).id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'Trial cancelled' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to cancel trial' }, { status: 500 });
  }
}
