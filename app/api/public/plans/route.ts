import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: Public API - Fetch active subscription plans (no cache so admin name changes show on pricing page)
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    
    // Fetch active plans
    const { data: plans, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (error) throw error;

    // Fetch plan items for each plan
    const plansWithItems = await Promise.all(
      (plans || []).map(async (plan) => {
        const { data: items } = await supabase
          .from("plan_items")
          .select("label, value, is_visible")
          .eq("plan_id", plan.id)
          .eq("is_visible", true)
          .order("display_order", { ascending: true });
        return {
          id: plan.id,
          name: plan.name,
          description: plan.description,
          billing_cycle: plan.billing_cycle,
          base_price: plan.base_price,
          items: (items || []).map(item => ({ label: item.label, value: item.value })),
        };
      })
    );

    return NextResponse.json(
      { success: true, plans: plansWithItems },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
