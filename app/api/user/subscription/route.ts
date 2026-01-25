import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

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

    // Get subscription
    const { data: subscription } = await supabase
      .from("company_subscriptions")
      .select(`
        *,
        subscription_plans!inner(id, name, description, billing_cycle, base_price)
      `)
      .eq("company_id", company.id)
      .maybeSingle();

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
