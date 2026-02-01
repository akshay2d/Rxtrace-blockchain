import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCompanyForUser } from "@/lib/company/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Access: paid subscription from company_subscriptions OR company-level trial. Trial is NOT in company_subscriptions. */
export async function GET() {
  try {
    const supabase = await (await import("@/lib/supabase/server")).supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const resolved = await resolveCompanyForUser(
      admin,
      user.id,
      "id, subscription_status, trial_started_at, trial_ends_at, trial_status"
    );

    if (!resolved) {
      return NextResponse.json({ success: true, company_id: null, subscription_status: null, subscription: null, add_ons: [], discounts: [] });
    }

    const companyId = resolved.companyId;
    const company = resolved.company as Record<string, unknown>;
    const subscriptionStatus = (company.subscription_status as string) ?? null;

    const { data: subscriptionRaw } = await admin
      .from("company_subscriptions")
      .select(`
        *,
        subscription_plans(id, name, description, billing_cycle, base_price)
      `)
      .eq("company_id", companyId)
      .maybeSingle();

    let subscription: any = null;

    if (subscriptionRaw) {
      const planData = Array.isArray(subscriptionRaw.subscription_plans)
        ? subscriptionRaw.subscription_plans[0]
        : subscriptionRaw.subscription_plans;
      subscription = {
        id: subscriptionRaw.id,
        company_id: subscriptionRaw.company_id,
        plan_id: subscriptionRaw.plan_id ?? null,
        status: subscriptionRaw.status,
        trial_end: subscriptionRaw.trial_end,
        current_period_end: subscriptionRaw.current_period_end,
        razorpay_subscription_id: subscriptionRaw.razorpay_subscription_id,
        created_at: subscriptionRaw.created_at,
        updated_at: subscriptionRaw.updated_at,
        plan: planData || null,
        is_trial: false,
      };
    } else {
      const trialStatus = company.trial_status;
      const trialEndsAt = company.trial_ends_at;
      const now = new Date();

      if (trialStatus === 'active' && trialEndsAt) {
        const end = new Date(trialEndsAt as string);
        if (end > now) {
          subscription = {
            id: `trial-${companyId}`,
            company_id: companyId,
            plan_id: null,
            status: 'trialing',
            trial_end: trialEndsAt,
            current_period_end: trialEndsAt,
            razorpay_subscription_id: null,
            created_at: company.trial_started_at,
            updated_at: null,
            plan: null,
            is_trial: true,
          };
        } else {
          await admin.from("companies").update({
            trial_status: 'expired',
            subscription_status: 'expired',
            updated_at: now.toISOString(),
          }).eq("id", companyId);
        }
      }
    }

    const { data: addOns } = await admin
      .from("company_add_ons")
      .select(`
        *,
        add_ons!inner(id, name, description, price, unit, recurring)
      `)
      .eq("company_id", companyId)
      .eq("status", "ACTIVE");

    const { data: discounts } = await admin
      .from("company_discounts")
      .select(`
        *,
        discounts!inner(id, code, type, value)
      `)
      .eq("company_id", companyId);

    return NextResponse.json({
      success: true,
      company_id: companyId,
      subscription_status: subscriptionStatus,
      subscription: subscription || null,
      add_ons: addOns || [],
      discounts: discounts || [],
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}
