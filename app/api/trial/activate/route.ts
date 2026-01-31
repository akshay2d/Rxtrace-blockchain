import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Trial is company-level only. No subscription row. No payment. No plan. */
async function handleTrialActivation(company_id: string, user_id: string) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: company, error: companyErr } = await supabase
    .from('companies')
    .select('id, trial_status, trial_ends_at, subscription_status')
    .eq('id', company_id)
    .eq('user_id', user_id)
    .maybeSingle();

  if (companyErr) {
    console.error('Trial: company check error', companyErr);
    return NextResponse.json({ error: 'Failed to verify company' }, { status: 500 });
  }
  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  const trialStatus = (company as any).trial_status;
  const trialEndsAt = (company as any).trial_ends_at;

  if (trialStatus === 'active' && trialEndsAt) {
    if (new Date(trialEndsAt) > new Date()) {
      return NextResponse.json({
        success: false,
        message: 'Trial already active for this company',
        already_activated: true,
      }, { status: 409 });
    }
  }

  const { data: paidSub } = await supabase
    .from('company_subscriptions')
    .select('id')
    .eq('company_id', company_id)
    .in('status', ['ACTIVE', 'PAUSED'])
    .maybeSingle();

  if (paidSub) {
    return NextResponse.json({
      success: false,
      message: 'Company already has a paid subscription. Manage from Billing.',
      already_activated: false,
    }, { status: 409 });
  }

  const now = new Date();
  const trialEndsAtDate = new Date(now);
  trialEndsAtDate.setDate(trialEndsAtDate.getDate() + 15);

  const { error: updateErr } = await supabase
    .from('companies')
    .update({
      trial_started_at: now.toISOString(),
      trial_ends_at: trialEndsAtDate.toISOString(),
      trial_status: 'active',
      subscription_status: 'trial',
    })
    .eq('id', company_id);

  if (updateErr) {
    console.error('Trial: failed to set company trial state', updateErr);
    return NextResponse.json({
      error: 'Failed to activate trial',
      details: updateErr.message,
    }, { status: 500 });
  }

  try {
    await writeAuditLog({
      companyId: company_id,
      actor: user_id || 'system',
      action: 'TRIAL_ACTIVATED',
      status: 'success',
      integrationSystem: 'system',
      metadata: {
        trial_ends_at: trialEndsAtDate.toISOString(),
        description: '15-day free trial (no payment, no subscription row)',
      },
    });
  } catch (_) {}

  return NextResponse.json({
    success: true,
    message: 'Trial activated successfully',
    trial_end_date: trialEndsAtDate.toISOString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const company_id = body?.company_id;
    if (!company_id) {
      return NextResponse.json({ error: 'company_id is required' }, { status: 400 });
    }

    let userId = body?.user_id;
    if (!userId) {
      const { data: { user }, error: authErr } = await (await supabaseServer()).auth.getUser();
      if (authErr || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      userId = user.id;
    }

    return await handleTrialActivation(company_id, userId);
  } catch (error: any) {
    console.error('Trial activation error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to activate trial' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405 });
}
