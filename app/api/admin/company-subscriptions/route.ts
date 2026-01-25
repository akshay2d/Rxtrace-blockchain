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

// GET: List company subscriptions
export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");

    let query = supabase
      .from("company_subscriptions")
      .select(`
        *,
        companies!inner(id, company_name),
        subscription_plans!inner(id, name, billing_cycle, base_price)
      `)
      .order("created_at", { ascending: false });

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return NextResponse.json({ success: true, subscriptions: data || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Assign subscription to company
export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { company_id, plan_id, trial_days } = body;

    if (!company_id || !plan_id) {
      return NextResponse.json(
        { success: false, error: "company_id and plan_id are required" },
        { status: 400 }
      );
    }

    // Get plan
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", plan_id)
      .single();

    if (!plan) {
      return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });
    }

    // Get company
    const { data: company } = await supabase
      .from("companies")
      .select("id, razorpay_customer_id")
      .eq("id", company_id)
      .single();

    if (!company) {
      return NextResponse.json({ success: false, error: "Company not found" }, { status: 404 });
    }

    // Check if subscription exists
    const { data: existing } = await supabase
      .from("company_subscriptions")
      .select("*")
      .eq("company_id", company_id)
      .maybeSingle();

    const trialEnd = trial_days
      ? new Date(Date.now() + trial_days * 24 * 60 * 60 * 1000).toISOString()
      : null;

    let razorpay_subscription_id: string | null = null;

    // Create Razorpay subscription if plan has razorpay_plan_id
    if (plan.razorpay_plan_id && company.razorpay_customer_id) {
      try {
        const razorpay = getRazorpay();
        const subscription = await razorpay.subscriptions.create({
          plan_id: plan.razorpay_plan_id,
          customer_notify: 1,
          total_count: 12, // 12 months
          start_at: trialEnd ? Math.floor(new Date(trialEnd).getTime() / 1000) : undefined,
        });
        razorpay_subscription_id = subscription.id;
      } catch (razorpayErr: any) {
        console.error("Razorpay subscription creation failed:", razorpayErr);
        // Continue without Razorpay subscription - can be synced later
      }
    }

    const subscriptionData = {
      company_id,
      plan_id,
      razorpay_subscription_id,
      status: trialEnd ? "TRIAL" : "ACTIVE",
      trial_end: trialEnd,
      current_period_end: trialEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    let subscription;
    if (existing) {
      const { data, error } = await supabase
        .from("company_subscriptions")
        .update(subscriptionData)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      subscription = data;
    } else {
      const { data, error } = await supabase
        .from("company_subscriptions")
        .insert(subscriptionData)
        .select()
        .single();
      if (error) throw error;
      subscription = data;
    }

    // Update company razorpay fields
    if (razorpay_subscription_id) {
      await supabase
        .from("companies")
        .update({
          razorpay_subscription_id: razorpay_subscription_id,
          razorpay_subscription_status: subscription.status,
          razorpay_plan_id: plan.razorpay_plan_id,
        })
        .eq("id", company_id);
    }

    // Log audit
    await supabase.from("audit_logs").insert({
      action: existing ? "SUBSCRIPTION_UPDATED" : "SUBSCRIPTION_ASSIGNED",
      company_id,
      old_value: existing || null,
      new_value: subscription,
    });

    return NextResponse.json({ success: true, subscription });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PUT: Update subscription (pause/resume/cancel)
export async function PUT(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { subscription_id, action, trial_days } = body;

    if (!subscription_id || !action) {
      return NextResponse.json(
        { success: false, error: "subscription_id and action are required" },
        { status: 400 }
      );
    }

    const { data: subscription } = await supabase
      .from("company_subscriptions")
      .select("*")
      .eq("id", subscription_id)
      .single();

    if (!subscription) {
      return NextResponse.json({ success: false, error: "Subscription not found" }, { status: 404 });
    }

    let newStatus = subscription.status;
    let updates: any = {};

    if (action === "pause") {
      newStatus = "PAUSED";
      if (subscription.razorpay_subscription_id) {
        try {
          const razorpay = getRazorpay();
          await razorpay.subscriptions.pause(subscription.razorpay_subscription_id);
        } catch (err: any) {
          console.error("Razorpay pause failed:", err);
        }
      }
    } else if (action === "resume") {
      newStatus = "ACTIVE";
      if (subscription.razorpay_subscription_id) {
        try {
          const razorpay = getRazorpay();
          await razorpay.subscriptions.resume(subscription.razorpay_subscription_id);
        } catch (err: any) {
          console.error("Razorpay resume failed:", err);
        }
      }
    } else if (action === "cancel") {
      newStatus = "CANCELLED";
      if (subscription.razorpay_subscription_id) {
        try {
          const razorpay = getRazorpay();
          await razorpay.subscriptions.cancel(subscription.razorpay_subscription_id);
        } catch (err: any) {
          console.error("Razorpay cancel failed:", err);
        }
      }
    } else if (action === "extend_trial" && trial_days) {
      const newTrialEnd = new Date(Date.now() + trial_days * 24 * 60 * 60 * 1000).toISOString();
      updates.trial_end = newTrialEnd;
      if (subscription.status === "TRIAL") {
        updates.current_period_end = newTrialEnd;
      }
    }

    updates.status = newStatus;

    const { data: updated, error } = await supabase
      .from("company_subscriptions")
      .update(updates)
      .eq("id", subscription_id)
      .select()
      .single();

    if (error) throw error;

    // Update company status
    await supabase
      .from("companies")
      .update({ razorpay_subscription_status: newStatus })
      .eq("id", subscription.company_id);

    // Log audit
    await supabase.from("audit_logs").insert({
      action: `SUBSCRIPTION_${action.toUpperCase()}`,
      company_id: subscription.company_id,
      old_value: subscription,
      new_value: updated,
    });

    return NextResponse.json({ success: true, subscription: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
