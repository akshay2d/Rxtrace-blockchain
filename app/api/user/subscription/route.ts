import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: User's current subscription
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Get user's company
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!company) {
      return NextResponse.json({ success: true, subscription: null });
    }

    // Get subscription with plan data - use left join to include TRIAL (plan_id = NULL)
    const { data: subscriptionRaw } = await supabase
      .from("company_subscriptions")
      .select(`
        *,
        subscription_plans(id, name, description, billing_cycle, base_price)
      `)
      .eq("company_id", company.id)
      .maybeSingle();

    // Transform subscription to match expected structure
    // Supabase returns subscription_plans as an array, but we need a single plan object
    // TRIAL subscriptions have plan_id = NULL, so plan will be null
    let subscription = null;
    if (subscriptionRaw) {
      // Handle both array and object formats from Supabase
      const planData = Array.isArray(subscriptionRaw.subscription_plans) 
        ? subscriptionRaw.subscription_plans[0] 
        : subscriptionRaw.subscription_plans;
      
      subscription = {
        id: subscriptionRaw.id,
        company_id: subscriptionRaw.company_id,
        plan_id: subscriptionRaw.plan_id, // NULL for TRIAL
        status: subscriptionRaw.status,
        trial_end: subscriptionRaw.trial_end,
        current_period_end: subscriptionRaw.current_period_end,
        razorpay_subscription_id: subscriptionRaw.razorpay_subscription_id,
        created_at: subscriptionRaw.created_at,
        updated_at: subscriptionRaw.updated_at,
        plan: planData || null, // null for TRIAL (plan_id = NULL), single plan object for ACTIVE
      };
    }

    // Get add-ons
    const { data: addOns } = await supabase
      .from("company_add_ons")
      .select(`
        *,
        add_ons!inner(id, name, description, price, unit, recurring)
      `)
      .eq("company_id", company.id)
      .eq("status", "ACTIVE");

    // Get applied discounts
    const { data: discounts } = await supabase
      .from("company_discounts")
      .select(`
        *,
        discounts!inner(id, code, type, value)
      `)
      .eq("company_id", company.id);

    return NextResponse.json({
      success: true,
      subscription: subscription || null,
      add_ons: addOns || [],
      discounts: discounts || [],
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
