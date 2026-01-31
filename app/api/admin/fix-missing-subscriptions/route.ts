import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

// POST: Fix missing subscription records for companies with trial status
// This creates company_subscriptions records for companies that have trial status
// but don't have a subscription record. Trial records use plan_id NULL, is_trial true.
export async function POST(req: Request) {
  try {
    const { error: adminError } = await requireAdmin();
    if (adminError) return adminError;
    const supabase = getSupabaseAdmin();
    
    // Get all companies with trial status but no subscription record
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('id, subscription_status, subscription_plan, trial_end_date')
      .eq('subscription_status', 'trial')
      .not('trial_end_date', 'is', null);

    if (companiesError) {
      return NextResponse.json({ success: false, error: companiesError.message }, { status: 500 });
    }

    if (!companies || companies.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No companies need fixing',
        fixed: 0 
      });
    }

    let fixed = 0;
    const errors: string[] = [];

    // For each company, create subscription record if it doesn't exist (trial = no plan_id)
    for (const company of companies) {
      // Check if subscription already exists
      const { data: existing } = await supabase
        .from('company_subscriptions')
        .select('id')
        .eq('company_id', company.id)
        .maybeSingle();

      if (existing) {
        continue; // Already has subscription
      }

      // Create trial subscription record: plan_id NULL, is_trial true, status trialing
      const { error: subError } = await supabase
        .from('company_subscriptions')
        .insert({
          company_id: company.id,
          plan_id: null,
          status: 'trialing',
          is_trial: true,
          trial_end: company.trial_end_date,
          current_period_end: company.trial_end_date,
          razorpay_subscription_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (subError) {
        errors.push(`Company ${company.id}: ${subError.message}`);
      } else {
        fixed++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Fixed ${fixed} companies. ${errors.length} errors.`,
      fixed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
