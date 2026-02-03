import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { logAdminAction } from "@/lib/audit/admin";
import { requiresConfirmation, generateConfirmationToken, verifyConfirmationToken } from "@/lib/auth/confirmation";
import {
  getOrGenerateCorrelationId,
  logWithContext,
  measurePerformance,
  recordRouteMetric,
} from "@/lib/observability";
import Razorpay from "razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay not configured");
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// GET: List company subscriptions. PHASE-10: Added observability.
export async function GET(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;
  
  try {
    // PHASE-10: Generate correlation ID
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');
    
    logWithContext('info', 'Admin company subscriptions list request', {
      correlationId,
      route: '/api/admin/company-subscriptions',
      method: 'GET',
    });

    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin access denied', {
        correlationId,
        route: '/api/admin/company-subscriptions',
        method: 'GET',
      });
      recordRouteMetric('/api/admin/company-subscriptions', 'GET', false, Date.now() - startTime);
      return adminError;
    }
    
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");

    // PHASE-10: Measure performance
    const { result, duration } = await measurePerformance(
      'admin.company-subscriptions.list',
      async () => {
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
        return { subscriptions: data || [] };
      },
      { correlationId, route: '/api/admin/company-subscriptions', method: 'GET', userId, companyId }
    );

    logWithContext('info', 'Admin company subscriptions list completed', {
      correlationId,
      route: '/api/admin/company-subscriptions',
      method: 'GET',
      userId,
      subscriptionCount: result.subscriptions.length,
      companyId,
      duration,
    });

    recordRouteMetric('/api/admin/company-subscriptions', 'GET', true, duration);
    return NextResponse.json({ success: true, subscriptions: result.subscriptions });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin company subscriptions list failed', {
      correlationId,
      route: '/api/admin/company-subscriptions',
      method: 'GET',
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/company-subscriptions', 'GET', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Assign subscription to company. PHASE-10: Added observability.
export async function POST(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;
  
  try {
    // PHASE-10: Generate correlation ID
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');
    
    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin access denied', {
        correlationId,
        route: '/api/admin/company-subscriptions',
        method: 'POST',
      });
      recordRouteMetric('/api/admin/company-subscriptions', 'POST', false, Date.now() - startTime);
      return adminError;
    }
    
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { company_id, plan_id, trial_days } = body;
    
    logWithContext('info', 'Admin subscription assign request', {
      correlationId,
      route: '/api/admin/company-subscriptions',
      method: 'POST',
      userId,
      companyId: company_id,
      planId: plan_id,
    });

    if (!company_id || !plan_id) {
      recordRouteMetric('/api/admin/company-subscriptions', 'POST', false, Date.now() - startTime);
      return NextResponse.json(
        { success: false, error: "company_id and plan_id are required" },
        { status: 400 }
      );
    }

    // PHASE-10: Measure performance
    const { result: subscriptionData, duration } = await measurePerformance(
      'admin.company-subscriptions.assign',
      async () => {
        // Get plan
        const { data: plan } = await supabase
          .from("subscription_plans")
          .select("*")
          .eq("id", plan_id)
          .single();

        if (!plan) {
          throw new Error("Plan not found");
        }

        // Get company
        const { data: company } = await supabase
          .from("companies")
          .select("id, razorpay_customer_id")
          .eq("id", company_id)
          .single();

        if (!company) {
          throw new Error("Company not found");
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

        // Create Razorpay subscription ONLY for paid (non-trial) assignments.
        // Trial is company-level; old trial flow created ₹5 Razorpay subs—removed.
        if (plan.razorpay_plan_id && company.razorpay_customer_id && !trialEnd) {
          try {
            const razorpay = getRazorpay();
            const subscription = await razorpay.subscriptions.create({
              plan_id: plan.razorpay_plan_id,
              customer_notify: 1,
              total_count: 12, // 12 months
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
          status: trialEnd ? "trial" : "active",
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

        return { subscription, existing, plan };
      },
      { correlationId, route: '/api/admin/company-subscriptions', method: 'POST', userId, companyId: company_id, planId: plan_id }
    );

    // Log audit
    await supabase.from("audit_logs").insert({
      action: subscriptionData.existing ? "SUBSCRIPTION_UPDATED" : "SUBSCRIPTION_ASSIGNED",
      company_id,
      old_value: subscriptionData.existing || null,
      new_value: subscriptionData.subscription,
    });

    logWithContext('info', 'Admin subscription assigned', {
      correlationId,
      route: '/api/admin/company-subscriptions',
      method: 'POST',
      userId,
      companyId: company_id,
      subscriptionId: subscriptionData.subscription.id,
      planId: plan_id,
      isUpdate: !!subscriptionData.existing,
      duration,
    });

    recordRouteMetric('/api/admin/company-subscriptions', 'POST', true, duration);
    return NextResponse.json({ success: true, subscription: subscriptionData.subscription });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin subscription assign failed', {
      correlationId,
      route: '/api/admin/company-subscriptions',
      method: 'POST',
      userId,
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/company-subscriptions', 'POST', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PUT: Update subscription (pause/resume/cancel). PHASE-6: Cancel requires confirmation and audit. PHASE-10: Added observability.
export async function PUT(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;
  
  try {
    // PHASE-10: Generate correlation ID
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');
    
    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin access denied', {
        correlationId,
        route: '/api/admin/company-subscriptions',
        method: 'PUT',
      });
      recordRouteMetric('/api/admin/company-subscriptions', 'PUT', false, Date.now() - startTime);
      return adminError;
    }
    
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { subscription_id, action, trial_days, confirmation_token } = body;
    
    logWithContext('info', 'Admin subscription update request', {
      correlationId,
      route: '/api/admin/company-subscriptions',
      method: 'PUT',
      userId,
      subscriptionId: subscription_id,
      action,
    });

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

    // PHASE-6: Check if confirmation is required for cancel action
    let needsConfirmation = false;
    let actionConstant = "";
    if (action === "cancel") {
      actionConstant = "SUBSCRIPTION_CANCEL";
      needsConfirmation = requiresConfirmation(actionConstant);
    } else if (action === "delete") {
      actionConstant = "SUBSCRIPTION_DELETE";
      needsConfirmation = requiresConfirmation(actionConstant);
    }

    if (needsConfirmation && !confirmation_token) {
      const token = generateConfirmationToken({
        userId: userId!,
        action: actionConstant,
        resourceId: subscription_id,
        metadata: { subscription_id, action, company_id: subscription.company_id },
      });
      
      logWithContext('info', 'Subscription update requires confirmation', {
        correlationId,
        route: '/api/admin/company-subscriptions',
        method: 'PUT',
        userId,
        subscriptionId: subscription_id,
        action,
        actionConstant,
      });
      
      return NextResponse.json({
        requires_confirmation: true,
        confirmation_token: token,
        message: "This action requires confirmation. Please include confirmation_token in the request body.",
      }, { status: 200 });
    }

    if (needsConfirmation && confirmation_token) {
      const verification = verifyConfirmationToken(confirmation_token, userId!, actionConstant);
      if (!verification.valid) {
        return NextResponse.json(
          { success: false, error: verification.error || "Invalid confirmation token" },
          { status: 400 }
        );
      }
    }

    // PHASE-10: Measure performance
    const { result: updateResult, duration } = await measurePerformance(
      'admin.company-subscriptions.update',
      async () => {
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
          newStatus = "active";
          if (subscription.razorpay_subscription_id) {
            try {
              const razorpay = getRazorpay();
              await razorpay.subscriptions.resume(subscription.razorpay_subscription_id);
            } catch (err: any) {
              console.error("Razorpay resume failed:", err);
            }
          }
        } else if (action === "cancel") {
          newStatus = "cancelled";
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
          if (subscription.status === "TRIAL" || subscription.status === "trial") {
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

        return { updated, newStatus };
      },
      { correlationId, route: '/api/admin/company-subscriptions', method: 'PUT', userId, subscriptionId: subscription_id, action }
    );

    // PHASE-6: Enhanced audit logging for cancel/delete, standard logging for others
    if (needsConfirmation) {
      await logAdminAction({
        action: actionConstant,
        resourceType: "company_subscription",
        resourceId: subscription_id,
        companyId: subscription.company_id,
        oldValue: subscription,
        newValue: updateResult.updated,
        status: "success",
        requiresConfirmation: true,
        confirmationToken: confirmation_token,
      });
    } else {
      // Standard audit logging for non-destructive actions
      await supabase.from("audit_logs").insert({
        action: `SUBSCRIPTION_${action.toUpperCase()}`,
        company_id: subscription.company_id,
        old_value: subscription,
        new_value: updateResult.updated,
      });
    }

    logWithContext('info', 'Admin subscription updated', {
      correlationId,
      route: '/api/admin/company-subscriptions',
      method: 'PUT',
      userId,
      subscriptionId: subscription_id,
      action,
      newStatus: updateResult.newStatus,
      duration,
    });

    recordRouteMetric('/api/admin/company-subscriptions', 'PUT', true, duration);
    return NextResponse.json({ success: true, subscription: updateResult.updated });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    
    logWithContext('error', 'Admin subscription update failed', {
      correlationId,
      route: '/api/admin/company-subscriptions',
      method: 'PUT',
      userId,
      subscriptionId: subscription_id,
      action,
      error: err.message || String(err),
      duration,
    });
    
    recordRouteMetric('/api/admin/company-subscriptions', 'PUT', false, duration);
    
    // PHASE-6: Log failed action for cancel/delete
    if (needsConfirmation && subscription_id) {
      try {
        const supabase = getSupabaseAdmin();
        const { data: subscription } = await supabase
          .from("company_subscriptions")
          .select("*")
          .eq("id", subscription_id)
          .maybeSingle();
        
        await logAdminAction({
          action: actionConstant,
          resourceType: "company_subscription",
          resourceId: subscription_id,
          companyId: subscription?.company_id,
          oldValue: subscription || null,
          newValue: null,
          status: "failed",
          metadata: { error: err.message || String(err) },
        });
      } catch (auditErr) {
        // Don't fail if audit logging fails
      }
    }
    
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
