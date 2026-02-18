import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';
import { safeApiErrorMessage } from '@/lib/api-error';

const TRIAL_DAYS_DEFAULT = 15;
const TRIAL_OVERRIDE_EMAIL = 'akshaytilwanker@gmail.com';
const TRIAL_OVERRIDE_COMPANY = 'Varsha Food and Cosmetics';

function resolveTrialDurationDays(): number {
  const rawValue =
    Number(process.env.TRIAL_DAYS ?? process.env.TRIAL_DURATION_DAYS ?? TRIAL_DAYS_DEFAULT);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return TRIAL_DAYS_DEFAULT;
  }
  return Math.floor(rawValue);
}

const TRIAL_STATUSES_TO_BLOCK = new Set(['trial', 'trialing', 'active', 'expired']);

/** Trial activation now depends on session-derived company ownership and a single subscription row. */
export async function POST(_: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: companies, error: companiesError } = await admin
      .from('companies')
      .select('id, name')
      .eq('user_id', user.id);

    if (companiesError) {
      throw companiesError;
    }

    if (!companies || companies.length === 0) {
      return NextResponse.json(
        { error: 'Company not found for this user.' },
        { status: 404 }
      );
    }

    if (companies.length > 1) {
      return NextResponse.json(
        { error: 'Multiple companies found for this user. System supports one company per user only.' },
        { status: 409 }
      );
    }

    const company = companies[0];
    const companyNameNormalized = (company.name ?? '').toString().trim().toLowerCase();
    if (
      user.email?.toLowerCase() === TRIAL_OVERRIDE_EMAIL &&
      companyNameNormalized !== TRIAL_OVERRIDE_COMPANY.toLowerCase()
    ) {
      return NextResponse.json(
        { error: 'User is not associated with the expected company.' },
        { status: 403 }
      );
    }

    const { data: existingSubscription, error: subError } = await admin
      .from('company_subscriptions')
      .select('id, status, is_trial')
      .eq('company_id', company.id)
      .maybeSingle();

    if (subError) {
      throw subError;
    }

    const status = (existingSubscription?.status ?? '').toString().toLowerCase().trim();
    const alreadyUsedSubscription =
      existingSubscription &&
      (existingSubscription.is_trial ||
        TRIAL_STATUSES_TO_BLOCK.has(status));

    if (alreadyUsedSubscription) {
      return NextResponse.json(
        { error: 'Trial period expired for this user.' },
        { status: 400 }
      );
    }

    let trialRowPresent = false;
    const { data: trialRow, error: trialRowError } = await admin
      .from('company_trials')
      .select('id')
      .eq('company_id', company.id)
      .maybeSingle();

    if (trialRowError && trialRowError.code !== '42P01') {
      throw trialRowError;
    }

    if (trialRow) {
      trialRowPresent = true;
    }

    if (trialRowPresent) {
      return NextResponse.json(
        { error: 'Trial period expired for this user.' },
        { status: 400 }
      );
    }

    const trialDays = resolveTrialDurationDays();
    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setUTCDate(trialEnd.getUTCDate() + trialDays);

    const { error: insertError } = await admin
      .from('company_subscriptions')
      .insert({
        company_id: company.id,
        plan_id: null,
        status: 'trialing',
        trial_end: trialEnd.toISOString(),
        current_period_end: trialEnd.toISOString(),
        is_trial: true,
        razorpay_subscription_id: null,
      })
      .select('id')
      .single();

    if (insertError) {
      const duplicate =
        insertError.code === '23505' ||
        insertError.message?.toLowerCase().includes('duplicate');
      if (duplicate) {
        return NextResponse.json(
          { error: 'Trial period expired for this user.' },
          { status: 400 }
        );
      }
      throw insertError;
    }

    const { error: companyUpdateError } = await admin
      .from('companies')
      .update({
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEnd.toISOString(),
        trial_status: 'active',
        subscription_status: 'trial',
      })
      .eq('id', company.id);

    if (companyUpdateError) {
      throw companyUpdateError;
    }

    try {
      await writeAuditLog({
        companyId: company.id,
        actor: user.id,
        action: 'TRIAL_ACTIVATED',
        status: 'success',
        integrationSystem: 'system',
        metadata: {
          trial_end: trialEnd.toISOString(),
          company_name: company.name,
        },
      });
    } catch (_) {
      // audit failures should not block the user
    }

    return NextResponse.json({
      message: 'Trial activated successfully.',
      company: company.name,
      trial_end: trialEnd.toISOString(),
    });
  } catch (error: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Trial activation error:', error);
    }
    return NextResponse.json(
      { error: safeApiErrorMessage(error, 'Failed to activate trial') },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405 });
}
