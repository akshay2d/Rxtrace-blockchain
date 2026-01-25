import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: Revenue analytics
export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();

    // Get active subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from('company_subscriptions')
      .select(`
        id,
        status,
        subscription_plans!inner(
          id,
          name,
          billing_cycle,
          base_price
        )
      `)
      .in('status', ['ACTIVE', 'TRIAL']);

    if (subError) throw subError;

    // Calculate MRR
    let mrr = 0;
    let arr = 0;
    const revenueByPlan: Record<string, number> = {};

    (subscriptions || []).forEach((sub: any) => {
      const plan = sub.subscription_plans;
      if (!plan) return;

      const price = Number(plan.base_price || 0);
      const cycle = plan.billing_cycle;

      if (cycle === 'monthly') {
        mrr += price;
      } else if (cycle === 'yearly') {
        mrr += price / 12;
        arr += price;
      }

      const planKey = `${plan.name}_${cycle}`;
      revenueByPlan[planKey] = (revenueByPlan[planKey] || 0) + price;
    });

    // Get add-on revenue (recurring add-ons)
    const { data: addOns, error: addOnError } = await supabase
      .from('company_add_ons')
      .select(`
        quantity,
        add_ons!inner(
          name,
          price,
          recurring
        )
      `)
      .eq('status', 'ACTIVE');

    if (addOnError) throw addOnError;

    let addOnRevenue = 0;
    const revenueByAddOn: Record<string, number> = {};

    (addOns || []).forEach((addOn: any) => {
      const addOnData = addOn.add_ons;
      if (!addOnData || !addOnData.recurring) return;

      const monthlyRevenue = (Number(addOnData.price || 0) * (addOn.quantity || 1)) / 12;
      addOnRevenue += monthlyRevenue;

      revenueByAddOn[addOnData.name] = (revenueByAddOn[addOnData.name] || 0) + monthlyRevenue;
    });

    // Get refund totals
    const { data: refunds, error: refundError } = await supabase
      .from('refunds')
      .select('amount, status')
      .eq('status', 'SUCCESS');

    if (refundError) throw refundError;

    const totalRefunds = (refunds || []).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);

    return NextResponse.json({
      success: true,
      mrr: Math.round(mrr * 100) / 100,
      arr: Math.round(arr * 100) / 100,
      add_on_mrr: Math.round(addOnRevenue * 100) / 100,
      total_mrr: Math.round((mrr + addOnRevenue) * 100) / 100,
      revenue_by_plan: revenueByPlan,
      revenue_by_addon: revenueByAddOn,
      total_refunds: totalRefunds,
      active_subscriptions: subscriptions?.length || 0,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
