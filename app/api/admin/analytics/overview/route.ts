import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/admin';
import {
  getOrGenerateCorrelationId,
  logWithContext,
  measurePerformance,
  recordRouteMetric,
} from '@/lib/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: Overview analytics. PHASE-11: Added observability.
export async function GET(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;

  try {
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');

    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin analytics overview access denied', {
        correlationId,
        route: '/api/admin/analytics/overview',
        method: 'GET',
      });
      recordRouteMetric('/api/admin/analytics/overview', 'GET', false, Date.now() - startTime);
      return adminError;
    }

    const supabase = getSupabaseAdmin();

    logWithContext('info', 'Admin analytics overview request', {
      correlationId,
      route: '/api/admin/analytics/overview',
      method: 'GET',
      userId,
    });

    const { result, duration } = await measurePerformance(
      'admin.analytics.overview',
      async () => {
        // Get company counts by subscription status
        const { data: subscriptions, error: subError } = await supabase
          .from('company_subscriptions')
          .select('status, company_id');

        if (subError) throw subError;

        const totalCompanies = subscriptions?.length || 0;
        const trialCompanies = subscriptions?.filter((s: any) => s.status === 'TRIAL').length || 0;
        const pausedCompanies = subscriptions?.filter((s: any) => s.status === 'PAUSED').length || 0;
        const cancelledCompanies = subscriptions?.filter((s: any) => s.status === 'CANCELLED').length || 0;

        // Get revenue data with company discount join
        const { data: activeSubs, error: revError } = await supabase
          .from('company_subscriptions')
          .select(`
        status,
        company_id,
        subscription_plans(
          billing_cycle,
          base_price
        ),
        companies!inner(
          discount_type,
          discount_value,
          discount_applies_to
        )
      `)
          .in('status', ['ACTIVE', 'TRIAL']);

        if (revError) throw revError;

        let mrr = 0;
        let arr = 0;
        (activeSubs || []).forEach((sub: any) => {
          if (sub.status === 'TRIAL') {
            return; // Skip TRIAL - no revenue
          }

          const plan = Array.isArray(sub.subscription_plans)
            ? sub.subscription_plans[0]
            : sub.subscription_plans;

          if (!plan) return;

          const basePrice = Number(plan.base_price || 0);
          const company = Array.isArray(sub.companies) ? sub.companies[0] : sub.companies;

          let finalPrice = basePrice;
          if (company) {
            const discount = {
              discount_type: company.discount_type,
              discount_value: company.discount_value,
              discount_applies_to: company.discount_applies_to,
            };

            if (discount.discount_type && discount.discount_value !== null) {
              if (discount.discount_applies_to === 'subscription' || discount.discount_applies_to === 'both') {
                let discountAmount = 0;
                if (discount.discount_type === 'percentage') {
                  discountAmount = (basePrice * discount.discount_value) / 100;
                } else if (discount.discount_type === 'flat') {
                  discountAmount = discount.discount_value;
                }
                finalPrice = Math.max(0, basePrice - discountAmount);
              }
            }
          }

          if (plan.billing_cycle === 'monthly') {
            mrr += finalPrice;
          } else if (plan.billing_cycle === 'yearly') {
            mrr += finalPrice / 12;
            arr += finalPrice;
          }
        });

        // Get add-on revenue
        const { data: addOns, error: addOnError } = await supabase
          .from('company_add_ons')
          .select(`
            quantity,
            add_ons!inner(price, recurring)
          `)
          .eq('status', 'ACTIVE');

        if (addOnError) throw addOnError;

        let addOnMRR = 0;
        (addOns || []).forEach((addOn: any) => {
          const addOnData = addOn.add_ons;
          if (addOnData?.recurring) {
            addOnMRR += (Number(addOnData.price || 0) * (addOn.quantity || 1)) / 12;
          }
        });

        const totalMRR = mrr + addOnMRR;

        // Count distinct active companies
        const activeCompanyIds = new Set(
          (subscriptions || [])
            .filter((s: any) => s.status === 'ACTIVE' || s.status === 'TRIAL')
            .map((s: any) => s.company_id)
        );
        const activeCompanyCount = activeCompanyIds.size;
        const arpc = activeCompanyCount > 0 ? totalMRR / activeCompanyCount : 0;

        // Get monthly usage (current period)
        const now = new Date();
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const { data: usageCounters, error: usageError } = await supabase
          .from('usage_counters')
          .select('used_quantity')
          .eq('period_start', periodStart.toISOString().split('T')[0]);

        if (usageError) throw usageError;

        const monthlyUsage = (usageCounters || []).reduce(
          (sum: number, u: any) => sum + (u.used_quantity || 0),
          0
        );

        return {
          success: true,
          total_companies: totalCompanies,
          trial_companies: trialCompanies,
          paused_companies: pausedCompanies,
          cancelled_companies: cancelledCompanies,
          mrr: Math.round(totalMRR * 100) / 100,
          arr: Math.round(arr * 100) / 100,
          arpc: Math.round(arpc * 100) / 100,
          monthly_usage: monthlyUsage,
        };
      },
      { correlationId, route: '/api/admin/analytics/overview', method: 'GET', userId }
    );

    logWithContext('info', 'Admin analytics overview completed', {
      correlationId,
      route: '/api/admin/analytics/overview',
      method: 'GET',
      userId,
      duration,
    });

    recordRouteMetric('/api/admin/analytics/overview', 'GET', true, duration);
    return NextResponse.json(result);
  } catch (err: any) {
    const duration = Date.now() - startTime;

    logWithContext('error', 'Admin analytics overview failed', {
      correlationId,
      route: '/api/admin/analytics/overview',
      method: 'GET',
      error: err.message || String(err),
      duration,
    });

    recordRouteMetric('/api/admin/analytics/overview', 'GET', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
