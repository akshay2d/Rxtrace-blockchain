import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUsage, getUsageLimits } from '@/lib/usage/tracking';
import { ensureActiveBillingUsage, billingUsageToDashboard } from '@/lib/billing/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: User's company usage (PHASE-3: single source = billing_usage for current period)
export async function GET(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: company } = await admin
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!company?.id) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const companyId = company.id as string;
    const limits = await getUsageLimits(admin, companyId);

    // PHASE-3: Prefer billing_usage for current period (single source of truth for user UI)
    const activeBilling = await ensureActiveBillingUsage({ supabase: admin, companyId }).catch(() => null);
    if (activeBilling) {
      const usageWithLimits = billingUsageToDashboard(activeBilling as any, limits);
      return NextResponse.json({ success: true, usage: usageWithLimits });
    }

    // Fallback: no active billing row (e.g. no plan) — use usage_counters + plan_items
    const usage = await getCurrentUsage(admin, companyId);
    const usageWithLimits: Record<string, any> = {};
    Object.keys(usage).forEach((metricType) => {
      const limit = limits[metricType];
      const used = usage[metricType] || 0;
      const limitValue = limit?.limit_value ?? null;
      usageWithLimits[metricType] = {
        used,
        limit_value: limitValue,
        limit_type: limit?.limit_type || 'NONE',
        exceeded: limitValue != null ? used > limitValue : false,
        percentage: limitValue != null && limitValue > 0 ? Math.min(100, Math.round((used / limitValue) * 100)) : 0,
      };
    });

    return NextResponse.json({ success: true, usage: usageWithLimits });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
