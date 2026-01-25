import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import Razorpay from "razorpay";

export const runtime = "nodejs";

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay not configured");
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// GET: List all subscription plans
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .order("display_order", { ascending: true });

    if (error) throw error;

    // Fetch plan items for each plan
    const plansWithItems = await Promise.all(
      (data || []).map(async (plan) => {
        const { data: items } = await supabase
          .from("plan_items")
          .select("*")
          .eq("plan_id", plan.id)
          .order("display_order", { ascending: true });
        return { ...plan, items: items || [] };
      })
    );

    return NextResponse.json({ success: true, plans: plansWithItems });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Create new subscription plan
export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { name, description, billing_cycle, base_price, display_order, items } = body;

    if (!name || !billing_cycle || base_price === undefined) {
      return NextResponse.json(
        { success: false, error: "name, billing_cycle, and base_price are required" },
        { status: 400 }
      );
    }

    // Create Razorpay plan
    let razorpay_plan_id: string | null = null;
    try {
      const razorpay = getRazorpay();
      const period = billing_cycle === "yearly" ? 12 : 1;
      const interval = "month";
      
      const razorpayPlan = await razorpay.plans.create({
        period,
        interval,
        item: {
          name: `${name} (${billing_cycle})`,
          amount: Math.round(base_price * 100), // Convert to paise
          currency: "INR",
        },
      });
      razorpay_plan_id = razorpayPlan.id;
    } catch (razorpayErr: any) {
      console.error("Razorpay plan creation failed:", razorpayErr);
      // Continue without Razorpay plan ID - can be synced later
    }

    // Create plan in database
    const { data: plan, error } = await supabase
      .from("subscription_plans")
      .insert({
        name,
        description,
        billing_cycle,
        base_price,
        razorpay_plan_id,
        display_order: display_order ?? 0,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    // Create plan items
    if (items && Array.isArray(items)) {
      for (const item of items) {
        await supabase.from("plan_items").insert({
          plan_id: plan.id,
          label: item.label,
          value: item.value,
          is_visible: item.is_visible !== false,
          display_order: item.display_order ?? 0,
        });
      }
    }

    // Log audit
    await supabase.from("audit_logs").insert({
      action: "SUBSCRIPTION_PLAN_CREATED",
      new_value: { plan_id: plan.id, name, billing_cycle, base_price },
      metadata: { razorpay_plan_id },
    });

    return NextResponse.json({ success: true, plan });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PUT: Update subscription plan
export async function PUT(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { id, name, description, billing_cycle, base_price, display_order, is_active, items } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }

    // Get current plan
    const { data: currentPlan } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", id)
      .single();

    if (!currentPlan) {
      return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });
    }

    // Update plan
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (billing_cycle !== undefined) updates.billing_cycle = billing_cycle;
    if (base_price !== undefined) updates.base_price = base_price;
    if (display_order !== undefined) updates.display_order = display_order;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data: plan, error } = await supabase
      .from("subscription_plans")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Update plan items if provided
    if (items && Array.isArray(items)) {
      // Delete existing items
      await supabase.from("plan_items").delete().eq("plan_id", id);
      
      // Insert new items
      for (const item of items) {
        await supabase.from("plan_items").insert({
          plan_id: id,
          label: item.label,
          value: item.value,
          is_visible: item.is_visible !== false,
          display_order: item.display_order ?? 0,
        });
      }
    }

    // Log audit
    await supabase.from("audit_logs").insert({
      action: "SUBSCRIPTION_PLAN_UPDATED",
      old_value: currentPlan,
      new_value: plan,
    });

    return NextResponse.json({ success: true, plan });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
