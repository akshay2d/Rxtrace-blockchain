import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { createRazorpayClient, getValidPaidPlanIds } from "@/lib/razorpay/server";

export const runtime = "nodejs";

/** Fix missing PAID subscription records only. Trial is company-level; do NOT create trial rows. Skip old trial (₹5) Razorpay subs. */
export async function POST(req: Request) {
  try {
    const { error: adminError } = await requireAdmin();
    if (adminError) return adminError;
    const supabase = getSupabaseAdmin();
    const { data: validPlanRows } = await supabase
      .from('subscription_plans')
      .select('razorpay_plan_id')
      .not('razorpay_plan_id', 'is', null);
    const validPlanIdsFromDb = new Set(
      (validPlanRows ?? []).map((r: any) => r?.razorpay_plan_id).filter(Boolean).map((s: string) => String(s).trim())
    );
    const validPlanIds = validPlanIdsFromDb.size > 0 ? validPlanIdsFromDb : getValidPaidPlanIds();

    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('id, subscription_status, razorpay_subscription_id, subscription_plan')
      .eq('subscription_status', 'active')
      .not('razorpay_subscription_id', 'is', null);

    if (companiesError) {
      return NextResponse.json({ success: false, error: companiesError.message }, { status: 500 });
    }

    if (!companies || companies.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No companies need fixing',
        fixed: 0,
      });
    }

    let fixed = 0;
    const errors: string[] = [];
    const razorpay = createRazorpayClient();

    for (const company of companies) {
      const { data: existing } = await supabase
        .from('company_subscriptions')
        .select('id')
        .eq('company_id', company.id)
        .maybeSingle();

      if (existing) continue;

      // Skip if Razorpay subscription is old trial (₹5) plan—not one of our 6 paid plans
      const rpSubId = (company as any).razorpay_subscription_id;
      if (rpSubId) {
        try {
          const rpSub = await (razorpay.subscriptions as any).fetch(rpSubId);
          const planId = (rpSub as any)?.plan_id;
          if (!planId || !validPlanIds.has(String(planId).trim())) {
            await supabase.from('companies').update({
              razorpay_subscription_id: null,
              razorpay_plan_id: null,
              razorpay_subscription_status: null,
              updated_at: new Date().toISOString(),
            }).eq('id', company.id);
            continue;
          }
        } catch {
          continue;
        }
      }

      const rawPlan = (company as any).subscription_plan ?? 'Starter';
      const planNameMap: Record<string, string> = { Starter: 'Starter Monthly', Growth: 'Growth Monthly', Enterprise: 'Enterprise Monthly' };
      const planName = planNameMap[rawPlan] ?? rawPlan;
      const { data: planRow } = await supabase
        .from('subscription_plans')
        .select('id, name')
        .eq('name', planName)
        .eq('billing_cycle', 'monthly')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      const planIdDb = (planRow as any)?.id;
      if (!planIdDb) {
        errors.push(`Company ${company.id}: no plan found for ${planName} (raw: ${rawPlan})`);
        continue;
      }

      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      const now = new Date().toISOString();

      const planCode = ((planRow as any)?.name ?? planName).toString().toLowerCase().replace(/\s+/g, '_');
      const { error: insertErr } = await supabase
        .from('company_subscriptions')
        .insert({
          company_id: company.id,
          plan_id: planIdDb,
          plan_code: planCode,
          billing_cycle: 'monthly',
          status: 'active',
          razorpay_subscription_id: (company as any).razorpay_subscription_id,
          is_trial: false,
          current_period_end: periodEnd.toISOString(),
          created_at: now,
          updated_at: now,
        });

      if (insertErr) {
        errors.push(`Company ${company.id}: ${insertErr.message}`);
      } else {
        fixed++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Fixed ${fixed} paid subscription records. Trial companies are not touched (trial is company-level only).`,
      fixed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
