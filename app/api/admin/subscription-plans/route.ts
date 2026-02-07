import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import {
  getOrGenerateCorrelationId,
  logWithContext,
  measurePerformance,
  recordRouteMetric,
} from "@/lib/observability";
import { approvedRazorpayPlanIdForName } from "@/lib/razorpay/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: List all subscription plans. PHASE-10: Added observability.
export async function GET() {
  const startTime = Date.now();
  let correlationId: string | null = null;
  
  try {
    // PHASE-10: Generate correlation ID
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');
    
    logWithContext('info', 'Admin subscription plans list request', {
      correlationId,
      route: '/api/admin/subscription-plans',
      method: 'GET',
    });

    // PHASE-1: Require admin access
    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin access denied', {
        correlationId,
        route: '/api/admin/subscription-plans',
        method: 'GET',
      });
      recordRouteMetric('/api/admin/subscription-plans', 'GET', false, Date.now() - startTime);
      return adminError;
    }
    
    // PHASE-10: Measure performance
    const { result, duration } = await measurePerformance(
      'admin.subscription-plans.list',
      async () => {
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
              .select("id, label, value, is_visible, display_order, limit_value, limit_type")
              .eq("plan_id", plan.id)
              .order("display_order", { ascending: true });
            return { ...plan, items: items || [] };
          })
        );

        // Enforce approved Razorpay plan IDs (Starter/Growth monthly/yearly only)
        const correctedPlans = [];
        for (const plan of plansWithItems) {
          const expectedPlanId = approvedRazorpayPlanIdForName(plan.name, plan.billing_cycle);
          if (expectedPlanId) {
            if (plan.razorpay_plan_id !== expectedPlanId) {
              await supabase
                .from("subscription_plans")
                .update({ razorpay_plan_id: expectedPlanId })
                .eq("id", plan.id);
              plan.razorpay_plan_id = expectedPlanId;
            }
          } else if (plan.razorpay_plan_id) {
            await supabase
              .from("subscription_plans")
              .update({ razorpay_plan_id: null })
              .eq("id", plan.id);
            plan.razorpay_plan_id = null;
          }
          correctedPlans.push(plan);
        }

        return { plans: correctedPlans };
      },
      { correlationId, route: '/api/admin/subscription-plans', method: 'GET', userId }
    );

    logWithContext('info', 'Admin subscription plans list completed', {
      correlationId,
      route: '/api/admin/subscription-plans',
      method: 'GET',
      userId,
      planCount: result.plans.length,
      duration,
    });

    recordRouteMetric('/api/admin/subscription-plans', 'GET', true, duration);
    return NextResponse.json({ success: true, plans: result.plans });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin subscription plans list failed', {
      correlationId,
      route: '/api/admin/subscription-plans',
      method: 'GET',
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/subscription-plans', 'GET', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Create new subscription plan. PHASE-10: Added observability.
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
        route: '/api/admin/subscription-plans',
        method: 'POST',
      });
      recordRouteMetric('/api/admin/subscription-plans', 'POST', false, Date.now() - startTime);
      return adminError;
    }
    
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { name, description, billing_cycle, base_price, display_order, items } = body;
    
    logWithContext('info', 'Admin subscription plan create request', {
      correlationId,
      route: '/api/admin/subscription-plans',
      method: 'POST',
      userId,
      planName: name,
      billingCycle: billing_cycle,
    });

    if (!name || !billing_cycle || base_price === undefined) {
      recordRouteMetric('/api/admin/subscription-plans', 'POST', false, Date.now() - startTime);
      return NextResponse.json(
        { success: false, error: "name, billing_cycle, and base_price are required" },
        { status: 400 }
      );
    }

    // PHASE-10: Measure performance
    const { result: planData, duration } = await measurePerformance(
      'admin.subscription-plans.create',
      async () => {
        const razorpay_plan_id = approvedRazorpayPlanIdForName(name, billing_cycle);
        if (!razorpay_plan_id) {
          throw new Error("Only Starter/Growth monthly or yearly plans are supported for Razorpay subscriptions");
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
              limit_value: item.limit_value ?? null,
              limit_type: item.limit_type ?? 'NONE',
            });
          }
        }

        return { plan, razorpay_plan_id };
      },
      { correlationId, route: '/api/admin/subscription-plans', method: 'POST', userId, planName: name }
    );

    // Log audit
    await supabase.from("audit_logs").insert({
      action: "SUBSCRIPTION_PLAN_CREATED",
      new_value: { plan_id: planData.plan.id, name, billing_cycle, base_price },
      metadata: { razorpay_plan_id: planData.razorpay_plan_id },
    });

    logWithContext('info', 'Admin subscription plan created', {
      correlationId,
      route: '/api/admin/subscription-plans',
      method: 'POST',
      userId,
      planId: planData.plan.id,
      planName: name,
      duration,
    });

    recordRouteMetric('/api/admin/subscription-plans', 'POST', true, duration);
    return NextResponse.json({ success: true, plan: planData.plan });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin subscription plan create failed', {
      correlationId,
      route: '/api/admin/subscription-plans',
      method: 'POST',
      userId,
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/subscription-plans', 'POST', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PUT: Update subscription plan. PHASE-10: Added observability.
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
        route: '/api/admin/subscription-plans',
        method: 'PUT',
      });
      recordRouteMetric('/api/admin/subscription-plans', 'PUT', false, Date.now() - startTime);
      return adminError;
    }
    
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { id, name, description, billing_cycle, base_price, display_order, is_active, items } = body;
    
    logWithContext('info', 'Admin subscription plan update request', {
      correlationId,
      route: '/api/admin/subscription-plans',
      method: 'PUT',
      userId,
      planId: id,
    });

    if (!id) {
      recordRouteMetric('/api/admin/subscription-plans', 'PUT', false, Date.now() - startTime);
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }

    // PHASE-10: Measure performance
    const { result: updateData, duration } = await measurePerformance(
      'admin.subscription-plans.update',
      async () => {
        // Get current plan
        const { data: currentPlan } = await supabase
          .from("subscription_plans")
          .select("*")
          .eq("id", id)
          .single();

        if (!currentPlan) {
          throw new Error("Plan not found");
        }

        // Update plan
        const updates: any = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (billing_cycle !== undefined) updates.billing_cycle = billing_cycle;
        if (base_price !== undefined) updates.base_price = base_price;
        if (display_order !== undefined) updates.display_order = display_order;
        if (is_active !== undefined) updates.is_active = is_active;
        const effectiveName = name ?? currentPlan.name;
        const effectiveCycle = billing_cycle ?? currentPlan.billing_cycle;
        const enforcedPlanId = approvedRazorpayPlanIdForName(effectiveName, effectiveCycle);
        updates.razorpay_plan_id = enforcedPlanId ?? null;

        const { data: plan, error } = await supabase
          .from("subscription_plans")
          .update(updates)
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return { currentPlan, plan };
      },
      { correlationId, route: '/api/admin/subscription-plans', method: 'PUT', userId, planId: id }
    );

    // Update plan items if provided
    if (items && Array.isArray(items)) {
      // PRIORITY-2: Track which quota limits changed for billing_usage updates
      // Get old limits BEFORE deleting items
      const { data: oldItems } = await supabase
        .from("plan_items")
        .select("label, limit_value")
        .eq("plan_id", id);
      
      const oldLimitsMap = new Map<string, number | null>();
      (oldItems || []).forEach((item: any) => {
        oldLimitsMap.set(item.label, item.limit_value);
      });
      
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
          limit_value: item.limit_value ?? null,
          limit_type: item.limit_type ?? 'NONE',
        });
      }
      
      // PRIORITY-2: Update billing_usage for active subscriptions using this plan
      // When plan_items.limit_value changes, update active billing_usage records
      const newLimitsMap = new Map<string, number | null>();
      items.forEach((item: any) => {
        newLimitsMap.set(item.label, item.limit_value);
      });
      
      // Find all active subscriptions using this plan
      const { data: activeSubscriptions } = await supabase
        .from("company_subscriptions")
        .select("company_id")
        .eq("plan_id", id)
        .in("status", ["active", "ACTIVE", "trial", "TRIAL"]);
      
      // Update billing_usage quota fields if limits changed
      if (activeSubscriptions && activeSubscriptions.length > 0) {
        // Map label to billing_usage field (case-insensitive match)
        const getFieldForLabel = (label: string): string | null => {
          const normalized = label.toLowerCase();
          if (normalized.includes('unit')) return 'unit_labels_quota';
          if (normalized.includes('box') && !normalized.includes('carton') && !normalized.includes('pallet')) return 'box_labels_quota';
          if (normalized.includes('carton')) return 'carton_labels_quota';
          if (normalized.includes('pallet') || normalized.includes('sscc')) return 'pallet_labels_quota';
          return null;
        };
        
        for (const sub of activeSubscriptions) {
          // Get current billing_usage to preserve existing values
          const { data: currentUsage } = await supabase
            .from("billing_usage")
            .select("box_labels_quota, carton_labels_quota, pallet_labels_quota")
            .eq("company_id", sub.company_id)
            .lte("billing_period_start", new Date().toISOString())
            .gt("billing_period_end", new Date().toISOString())
            .order("billing_period_start", { ascending: false })
            .limit(1)
            .maybeSingle();
          
          const updates: any = {};
          let hasUpdates = false;
          
          for (const [label, newLimit] of newLimitsMap.entries()) {
            const oldLimit = oldLimitsMap.get(label);
            if (oldLimit !== newLimit) {
              const field = getFieldForLabel(label);
              if (field) {
                updates[field] = newLimit ?? 0;
                hasUpdates = true;
              }
            }
          }
          
          // Also update SSCC quota (consolidated = box + carton + pallet)
          if (updates.box_labels_quota !== undefined || 
              updates.carton_labels_quota !== undefined || 
              updates.pallet_labels_quota !== undefined) {
            // Use updated values if available, otherwise use current values
            const boxQuota = updates.box_labels_quota !== undefined 
              ? updates.box_labels_quota 
              : (currentUsage?.box_labels_quota ?? 0);
            const cartonQuota = updates.carton_labels_quota !== undefined 
              ? updates.carton_labels_quota 
              : (currentUsage?.carton_labels_quota ?? 0);
            const palletQuota = updates.pallet_labels_quota !== undefined 
              ? updates.pallet_labels_quota 
              : (currentUsage?.pallet_labels_quota ?? 0);
            updates.sscc_labels_quota = boxQuota + cartonQuota + palletQuota;
            hasUpdates = true;
          }
          
          if (hasUpdates) {
            // Update active billing_usage record (current billing period)
            await supabase
              .from("billing_usage")
              .update(updates)
              .eq("company_id", sub.company_id)
              .lte("billing_period_start", new Date().toISOString())
              .gt("billing_period_end", new Date().toISOString());
          }
        }
      }
    }

    // Log audit
    await supabase.from("audit_logs").insert({
      action: "SUBSCRIPTION_PLAN_UPDATED",
      old_value: updateData.currentPlan,
      new_value: updateData.plan,
    });

    logWithContext('info', 'Admin subscription plan updated', {
      correlationId,
      route: '/api/admin/subscription-plans',
      method: 'PUT',
      userId,
      planId: id,
      hasItemsUpdate: !!(items && Array.isArray(items)),
      duration,
    });

    recordRouteMetric('/api/admin/subscription-plans', 'PUT', true, duration);
    return NextResponse.json({ success: true, plan: updateData.plan });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin subscription plan update failed', {
      correlationId,
      route: '/api/admin/subscription-plans',
      method: 'PUT',
      userId,
      planId: id,
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/subscription-plans', 'PUT', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
