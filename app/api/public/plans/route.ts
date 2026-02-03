import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Whitelist: only these 6 plans appear on Pricing page
const FIXED_PLANS: Array<{ name: string; billing_cycle: string }> = [
  { name: "Starter Monthly", billing_cycle: "monthly" },
  { name: "Starter Yearly", billing_cycle: "yearly" },
  { name: "Growth Monthly", billing_cycle: "monthly" },
  { name: "Growth Yearly", billing_cycle: "yearly" },
  { name: "Enterprise Monthly", billing_cycle: "monthly" },
  { name: "Enterprise Quarterly", billing_cycle: "quarterly" },
];

// GET: Public API - Fetch active subscription plans (whitelist: 6 fixed plans only)
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data: plans, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .order("display_order", { ascending: true });

    if (error) throw error;

    // Whitelist: only the 6 fixed plans (ignore is_active - these are the only plans we offer)
    const whitelisted = (plans || []).filter((p) => {
      const name = String(p.name || "").trim();
      const cycle = String(p.billing_cycle || "").toLowerCase();
      return FIXED_PLANS.some((f) => f.name === name && f.billing_cycle === cycle);
    });

    // Fetch plan items for each plan
    const plansWithItems = await Promise.all(
      whitelisted.map(async (plan) => {
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
