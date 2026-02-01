import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';
import { resolveCompanyForUser } from '@/lib/company/resolve';
import { safeApiErrorMessage } from '@/lib/api-error';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Trial is company-level only. No subscription row. No payment. No plan. */
async function handleTrialActivation(company_id: string, user_id: string) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Canonical resolver: user must be owner or active seat member of this company
  const resolved = await resolveCompanyForUser(
    supabase,
    user_id,
    'id, trial_status, trial_ends_at, subscription_status'
  );
  if (!resolved || resolved.companyId !== company_id) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }
  // RXTrace Gate: Only owner can start trial. Seat users cannot activate trial.
  if (!resolved.isOwner) {
    return NextResponse.json(
      { error: 'Only company owner can start trial. Contact your company admin.' },
      { status: 403 }
    );
  }
  const company = resolved.company as Record<string, unknown>;

  const trialStatus = company.trial_status;
  const trialEndsAt = company.trial_ends_at;

  if (trialStatus === 'active' && trialEndsAt) {
    if (new Date(trialEndsAt as string) > new Date()) {
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
    if (process.env.NODE_ENV !== 'production') {
      console.error('Trial: failed to set company trial state', updateErr);
    }
    return NextResponse.json({
      error: process.env.NODE_ENV === 'production' ? 'Failed to activate trial' : updateErr.message,
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
  } catch (error: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Trial activation error:', error);
    }
    return NextResponse.json({ error: safeApiErrorMessage(error, 'Failed to activate trial') }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405 });
}
