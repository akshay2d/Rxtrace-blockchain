import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';

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

    // Resolve company for this user
    const { data: companies, error: companyError } = await admin
      .from('companies')
      .select('id, company_name')
      .eq('user_id', user.id);

    if (companyError) throw companyError;

    if (!companies || companies.length === 0) {
      return NextResponse.json(
        { error: 'Company not found for this user.' },
        { status: 404 }
      );
    }

    if (companies.length > 1) {
      return NextResponse.json(
        { error: 'Multiple companies found for this user.' },
        { status: 409 }
      );
    }

    const company = companies[0];

    // Special override validation (optional)
    const companyNameNormalized = (company.company_name ?? '')
      .toString()
      .trim()
      .toLowerCase();

    if (
      user.email?.toLowerCase() === TRIAL_OVERRIDE_EMAIL &&
      companyNameNormalized !== TRIAL_OVERRIDE_COMPANY.toLowerCase()
    ) {
      return NextResponse.json(
        { error: 'User is not associated with the expected company.' },
        { status: 403 }
      );
    }

    // Check existing canonical trial row
    const { data: existingTrial, error: trialCheckError } = await admin
      .from('company_trials')
      .select('id, ends_at')
      .eq('company_id', company.id)
      .maybeSingle();

    if (trialCheckError) throw trialCheckError;

    if (existingTrial) {
      const endsAt = new Date(existingTrial.ends_at);
      if (endsAt > new Date()) {
        return NextResponse.json(
          { error: 'Trial already active for this company.' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Trial has expired. Contact admin to reset trial.' },
        { status: 400 }
      );
    }

    const trialDays = resolveTrialDurationDays();
    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setUTCDate(trialEnd.getUTCDate() + trialDays);

    // Insert trial row
    const { error: insertError } = await admin
      .from('company_trials')
      .insert({
        company_id: company.id,
        started_at: now.toISOString(),
        ends_at: trialEnd.toISOString(),
      });

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'Trial already exists. Contact admin to reset trial.' },
          { status: 400 }
        );
      }

      throw insertError;
    }

    // Audit log (non-blocking)
    try {
      await writeAuditLog({
        companyId: company.id,
        actor: user.id,
        action: 'TRIAL_ACTIVATED',
        status: 'success',
        integrationSystem: 'system',
        metadata: {
          trial_end: trialEnd.toISOString(),
          company_name: company.company_name,
        },
      });
    } catch (auditError) {
      console.warn('Audit log failed:', auditError);
    }

    return NextResponse.json({
      message: 'Trial activated successfully.',
      company: company.company_name,
      trial_end: trialEnd.toISOString(),
    });

  } catch (error: any) {
    console.error('Trial activation error:', error);

    return NextResponse.json(
      {
        error: error?.message || 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  );
}
