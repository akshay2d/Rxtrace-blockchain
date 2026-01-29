import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import {
  getOrGenerateCorrelationId,
  logWithContext,
  recordRouteMetric,
} from '@/lib/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: Revenue analytics
export async function GET(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;
  let userId: string | null = null;

  try {
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');

    const adminResult = await requireAdmin();
    userId = adminResult.userId || null;
    if (adminResult.error) {
      logWithContext('warn', 'Admin analytics revenue access denied', {
        correlationId,
        route: '/api/admin/analytics/revenue',
        method: 'GET',
      });
      recordRouteMetric('/api/admin/analytics/revenue', 'GET', false, Date.now() - startTime);
      return adminResult.error;
    }

    const supabase = getSupabaseAdmin();

    logWithContext('info', 'Admin analytics revenue request', {
      correlationId,
      route: '/api/admin/analytics/revenue',
      method: 'GET',
      userId,
    });

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

    // PRIORITY-2 FIX: Get add-on revenue with company discount
    const { data: addOns, error: addOnError } = await supabase
      .from('company_add_ons')
      .select(`
        quantity,
        add_ons!inner(
          name,
          price,
          recurring
        ),
        companies!inner(
          discount_type,
          discount_value,
          discount_applies_to
        )
      `)
      .eq('status', 'ACTIVE');

    if (addOnError) throw addOnError;

    let addOnRevenue = 0;
    const revenueByAddOn: Record<string, number> = {};

    (addOns || []).forEach((addOn: any) => {
      const addOnData = addOn.add_ons;
      if (!addOnData || !addOnData.recurring) return;

      const baseMonthlyRevenue = (Number(addOnData.price || 0) * (addOn.quantity || 1)) / 12;
      
      // PRIORITY-2: Apply company discount if applicable
      const company = Array.isArray(addOn.companies) ? addOn.companies[0] : addOn.companies;
      let finalRevenue = baseMonthlyRevenue;
      
      if (company) {
        const discount = {
          discount_type: company.discount_type,
          discount_value: company.discount_value,
          discount_applies_to: company.discount_applies_to,
        };
        
        if (discount.discount_type && discount.discount_value !== null) {
          if (discount.discount_applies_to === 'addon' || discount.discount_applies_to === 'both') {
            let discountAmount = 0;
            if (discount.discount_type === 'percentage') {
              discountAmount = (baseMonthlyRevenue * discount.discount_value) / 100;
            } else if (discount.discount_type === 'flat') {
              discountAmount = discount.discount_value / 12; // Monthly discount for yearly add-on
            }
            finalRevenue = Math.max(0, baseMonthlyRevenue - discountAmount);
          }
        }
      }
      
      addOnRevenue += finalRevenue;
      revenueByAddOn[addOnData.name] = (revenueByAddOn[addOnData.name] || 0) + finalRevenue;
    });

    // Get refund totals
    const { data: refunds, error: refundError } = await supabase
      .from('refunds')
      .select('amount, status')
      .eq('status', 'SUCCESS');

    if (refundError) throw refundError;

    const totalRefunds = (refunds || []).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);

    const duration = Date.now() - startTime;
    logWithContext('info', 'Admin analytics revenue completed', {
      correlationId,
      route: '/api/admin/analytics/revenue',
      method: 'GET',
      userId,
      duration,
    });
    recordRouteMetric('/api/admin/analytics/revenue', 'GET', true, duration);

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
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin analytics revenue failed', {
      correlationId,
      route: '/api/admin/analytics/revenue',
      method: 'GET',
      userId,
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/analytics/revenue', 'GET', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
