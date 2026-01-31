import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

/** Fix missing PAID subscription records only. Trial is company-level; do NOT create trial rows in company_subscriptions. */
export async function POST(req: Request) {
  try {
    const { error: adminError } = await requireAdmin();
    if (adminError) return adminError;
    const supabase = getSupabaseAdmin();

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

    for (const company of companies) {
      const { data: existing } = await supabase
        .from('company_subscriptions')
        .select('id')
        .eq('company_id', company.id)
        .maybeSingle();

      if (existing) continue;

      const planName = (company as any).subscription_plan ?? 'Starter';
      const { data: planRow } = await supabase
        .from('subscription_plans')
        .select('id')
        .ilike('name', planName)
        .eq('billing_cycle', 'monthly')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      const planIdDb = (planRow as any)?.id;
      if (!planIdDb) {
        errors.push(`Company ${company.id}: no plan found for ${planName}`);
        continue;
      }

      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      const now = new Date().toISOString();

      const { error: insertErr } = await supabase
        .from('company_subscriptions')
        .insert({
          company_id: company.id,
          plan_id: planIdDb,
          status: 'ACTIVE',
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
