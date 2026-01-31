import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function handleSimpleTrialActivation(company_id: string, user_id: string) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Verify company exists
  const { data: existingCompany, error: companyCheckError } = await supabase
    .from('companies')
    .select('id')
    .eq('id', company_id)
    .eq('user_id', user_id)
    .maybeSingle();

  if (companyCheckError) {
    console.error('Company check error:', companyCheckError);
    return NextResponse.json({ error: 'Failed to verify company' }, { status: 500 });
  }

  if (!existingCompany) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  // Check if trial already activated - check company_subscriptions ONLY (single source of truth)
  const { data: existingSubscription } = await supabase
    .from('company_subscriptions')
    .select('id, status')
    .eq('company_id', company_id)
    .maybeSingle();

  if (existingSubscription && (existingSubscription.status === 'TRIAL' || existingSubscription.status === 'trialing')) {
    // Check if trial is still active (not expired)
    const { data: subDetails } = await supabase
      .from('company_subscriptions')
      .select('trial_end')
      .eq('id', existingSubscription.id)
      .maybeSingle();
    
    if (subDetails?.trial_end) {
      const trialEnd = new Date(subDetails.trial_end);
      if (trialEnd > new Date()) {
        return NextResponse.json({
          success: false,
          message: 'Trial already activated for this company',
          already_activated: true,
        }, { status: 409 });
      }
    } else {
      return NextResponse.json({
        success: false,
        message: 'Trial already activated for this company',
        already_activated: true,
      }, { status: 409 });
    }
  }

  // Calculate trial end date (15 days from now)
  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + 15);
  const now = new Date().toISOString();

  // Trial = no payment, no plan, no Razorpay. One row per company: status trialing, plan_id NULL, is_trial true.
  const { error: subError } = await supabase
    .from('company_subscriptions')
    .insert({
      company_id: company_id,
      plan_id: null,
      status: 'trialing',
      is_trial: true,
      trial_end: trialEndDate.toISOString(),
      current_period_end: trialEndDate.toISOString(),
      razorpay_subscription_id: null,
      created_at: now,
      updated_at: now,
    });

  // FAIL FAST: If subscription record creation fails, rollback and fail trial activation
  if (subError) {
    console.error('CRITICAL: Failed to create subscription record:', subError);
    return NextResponse.json({ 
      error: 'Failed to activate trial: Could not create subscription record',
      details: subError.message 
    }, { status: 500 });
  }

  // Sync company.subscription_status so middleware allows access
  const { error: companyUpdateError } = await supabase
    .from('companies')
    .update({ subscription_status: 'trial' })
    .eq('id', company_id);

  if (companyUpdateError) {
    console.error('Trial: failed to update company subscription_status', companyUpdateError);
    // Continue - subscription record exists; company status sync is best-effort
  }

  // Audit log for trial activation
  try {
    await writeAuditLog({
      companyId: company_id,
      actor: user_id || 'system',
      action: 'TRIAL_ACTIVATED',
      status: 'success',
      integrationSystem: 'system',
      metadata: {
        trial_end_date: trialEndDate.toISOString(),
        description: '15-day free trial activated (no payment required)',
      },
    });
  } catch (auditError) {
    console.error('Failed to log audit event for trial activation:', auditError);
    // Continue - trial activated successfully, audit failure is logged
  }

  return NextResponse.json({
    success: true,
    message: 'Trial activated successfully',
    trial_end_date: trialEndDate.toISOString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { company_id, user_id: bodyUserId } = body;

    // Trial activation is payment-free: only company_id required; user resolved from auth if not sent
    if (!company_id) {
      return NextResponse.json({ error: 'company_id is required' }, { status: 400 });
    }

    let userId = bodyUserId;
    if (!userId) {
      const { data: { user }, error: authErr } = await (await supabaseServer()).auth.getUser();
      if (authErr || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      userId = user.id;
    }

    return await handleSimpleTrialActivation(company_id, userId);
  } catch (error: any) {
    console.error('Trial activation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to activate trial' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  );
}
