import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';
import { resolveCompanyForUser } from '@/lib/company/resolve';

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

function isDatabaseError(error: unknown): error is { code?: string; message?: string } {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  return typeof e.code === 'string' || typeof e.message === 'string';
}

function safeActivationErrorResponse(error: unknown) {
  if (isDatabaseError(error) && error.code === '23505') {
    return NextResponse.json({ error: 'Trial already active' }, { status: 400 });
  }
  return NextResponse.json(
    { error: 'Unable to activate trial right now. Please try again.' },
    { status: 500 }
  );
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

    // Canonical company resolution; activation is restricted to owner context.
    const resolved = await resolveCompanyForUser(admin, user.id, 'id, company_name');
    if (!resolved) {
      return NextResponse.json(
        { error: 'Company not found for this user.' },
        { status: 404 }
      );
    }
    if (!resolved.isOwner) {
      return NextResponse.json(
        { error: 'Only company owner can activate trial.' },
        { status: 403 }
      );
    }

    const company = resolved.company as { id: string; company_name?: string | null };

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
        return NextResponse.json({ error: 'Trial already active' }, { status: 400 });
      }

      return NextResponse.json(
        { error: 'Trial expired. Contact admin to reset.' },
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
        const { data: conflictTrial } = await admin
          .from('company_trials')
          .select('id, ends_at')
          .eq('company_id', company.id)
          .maybeSingle();
        if (conflictTrial && new Date(conflictTrial.ends_at) > new Date()) {
          return NextResponse.json({ error: 'Trial already active' }, { status: 400 });
        }
        return NextResponse.json(
          { error: 'Trial expired. Contact admin to reset.' },
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
    return safeActivationErrorResponse(error);
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  );
}
