/**
 * Phase 9: Billing production readiness health check (admin-only).
 * GET /api/billing/health
 * Returns whether Razorpay keys and subscription plan env vars are set; optional DB check.
 * Does not expose secret values.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  getRazorpayKeys,
  razorpaySubscriptionPlanAvailability,
} from '@/lib/razorpay/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { error: adminError } = await requireAdmin();
    if (adminError) return adminError;

    const checks: Record<string, boolean | string> = {};
    let billingReady = true;

    // Razorpay keys (presence only)
    try {
      getRazorpayKeys();
      checks.razorpay_keys = true;
    } catch {
      checks.razorpay_keys = false;
      billingReady = false;
    }

    // Subscription plan env vars (which are set)
    const planAvailability = razorpaySubscriptionPlanAvailability();
    const plansSet = Object.keys(planAvailability).filter((k) => planAvailability[k]);
    checks.subscription_plans_env_count = plansSet.length;
    checks.subscription_plans_env_set = plansSet.join(', ') || '(none)';
    if (plansSet.length === 0) billingReady = false;

    // Optional: subscription_plans table has rows
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('id')
        .eq('is_active', true)
        .limit(1);
      checks.subscription_plans_db = !error && data && data.length > 0;
      if (error || !data?.length) billingReady = false;
    } catch {
      checks.subscription_plans_db = false;
      billingReady = false;
    }

    const status = billingReady ? 'healthy' : 'degraded';
    return NextResponse.json(
      {
        status,
        billing_ready: billingReady,
        timestamp: new Date().toISOString(),
        checks,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        billing_ready: false,
        timestamp: new Date().toISOString(),
        error: e?.message ?? 'Health check failed',
      },
      { status: 503 }
    );
  }
}
