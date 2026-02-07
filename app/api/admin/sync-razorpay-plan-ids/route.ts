import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';

export const runtime = 'nodejs';

const PLAN_ENV_MAP: Array<{ name: string; billing_cycle: string; envVar: string }> = [
  { name: 'Starter Monthly', billing_cycle: 'monthly', envVar: 'RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_MONTHLY' },
  { name: 'Growth Monthly', billing_cycle: 'monthly', envVar: 'RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY' },
    { name: 'Starter Yearly', billing_cycle: 'yearly', envVar: 'RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_YEARLY' },
    { name: 'Growth Yearly', billing_cycle: 'yearly', envVar: 'RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_YEARLY' },
  // Enterprise plans removed
];

/**
 * Sync razorpay_plan_id in subscription_plans from env vars.
 * Run after updating env with correct Razorpay plan IDs (fixes ₹5 trial plan issue).
 */
export async function POST() {
  try {
    const { error: adminError } = await requireAdmin();
    if (adminError) return adminError;
    const supabase = getSupabaseAdmin();

    let synced = 0;
    const results: Record<string, string> = {};

    for (const { name, billing_cycle, envVar } of PLAN_ENV_MAP) {
      const planId = process.env[envVar];
      if (!planId || !String(planId).trim()) {
        results[`${name} (${billing_cycle})`] = 'skipped (env not set)';
        continue;
      }

      const { error } = await supabase
        .from('subscription_plans')
        .update({
          razorpay_plan_id: String(planId).trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('name', name)
        .eq('billing_cycle', billing_cycle);

      if (error) {
        results[`${name} (${billing_cycle})`] = `error: ${error.message}`;
      } else {
        synced++;
        results[`${name} (${billing_cycle})`] = 'synced';
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${synced} plans. Ensure env vars point to correct Razorpay plans (not trial ₹5 plan).`,
      synced,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
