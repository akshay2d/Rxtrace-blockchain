import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: Overview analytics
export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();

    // Get company counts by subscription status
    const { data: subscriptions, error: subError } = await supabase
      .from('company_subscriptions')
      .select('status');

    if (subError) throw subError;

    const totalCompanies = subscriptions?.length || 0;
    const trialCompanies = subscriptions?.filter((s: any) => s.status === 'TRIAL').length || 0;
    const pausedCompanies = subscriptions?.filter((s: any) => s.status === 'PAUSED').length || 0;
    const cancelledCompanies = subscriptions?.filter((s: any) => s.status === 'CANCELLED').length || 0;

    // Get revenue data
    const { data: activeSubs, error: revError } = await supabase
      .from('company_subscriptions')
      .select(`
        subscription_plans!inner(
          billing_cycle,
          base_price
        )
      `)
      .in('status', ['ACTIVE', 'TRIAL']);

    if (revError) throw revError;

    let mrr = 0;
    let arr = 0;
    (activeSubs || []).forEach((sub: any) => {
      const plan = sub.subscription_plans;
      if (!plan) return;
      const price = Number(plan.base_price || 0);
      if (plan.billing_cycle === 'monthly') {
        mrr += price;
      } else if (plan.billing_cycle === 'yearly') {
        mrr += price / 12;
        arr += price;
      }
    });

    // Get add-on revenue
    const { data: addOns } = await supabase
      .from('company_add_ons')
      .select(`
        quantity,
        add_ons!inner(price, recurring)
      `)
      .eq('status', 'ACTIVE');

    let addOnMRR = 0;
    (addOns || []).forEach((addOn: any) => {
      const addOnData = addOn.add_ons;
      if (addOnData?.recurring) {
        addOnMRR += (Number(addOnData.price || 0) * (addOn.quantity || 1)) / 12;
      }
    });

    const totalMRR = mrr + addOnMRR;
    const activeCompanyCount = subscriptions?.filter((s: any) => s.status === 'ACTIVE' || s.status === 'TRIAL').length || 0;
    const arpc = activeCompanyCount > 0 ? totalMRR / activeCompanyCount : 0;

    // Get monthly usage (current period)
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const { data: usageCounters } = await supabase
      .from('usage_counters')
      .select('used_quantity')
      .eq('period_start', periodStart.toISOString().split('T')[0]);

    const monthlyUsage = (usageCounters || []).reduce((sum: number, u: any) => sum + (u.used_quantity || 0), 0);

    return NextResponse.json({
      success: true,
      total_companies: totalCompanies,
      trial_companies: trialCompanies,
      paused_companies: pausedCompanies,
      cancelled_companies: cancelledCompanies,
      mrr: Math.round(totalMRR * 100) / 100,
      arr: Math.round(arr * 100) / 100,
      arpc: Math.round(arpc * 100) / 100,
      monthly_usage: monthlyUsage,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
