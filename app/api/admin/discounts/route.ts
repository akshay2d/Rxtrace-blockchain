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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: List all discounts. PHASE-10: Added observability.
export async function GET() {
  const startTime = Date.now();
  let correlationId: string | null = null;
  
  try {
    // PHASE-10: Generate correlation ID
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');
    
    logWithContext('info', 'Admin discounts list request', {
      correlationId,
      route: '/api/admin/discounts',
      method: 'GET',
    });

    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin access denied', {
        correlationId,
        route: '/api/admin/discounts',
        method: 'GET',
      });
      recordRouteMetric('/api/admin/discounts', 'GET', false, Date.now() - startTime);
      return adminError;
    }

    // PHASE-10: Measure performance
    const { result, duration } = await measurePerformance(
      'admin.discounts.list',
      async () => {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from("discounts")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;
        return { discounts: data || [] };
      },
      { correlationId, route: '/api/admin/discounts', method: 'GET', userId }
    );

    logWithContext('info', 'Admin discounts list completed', {
      correlationId,
      route: '/api/admin/discounts',
      method: 'GET',
      userId,
      discountCount: result.discounts.length,
      duration,
    });

    recordRouteMetric('/api/admin/discounts', 'GET', true, duration);
    return NextResponse.json({ success: true, discounts: result.discounts });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin discounts list failed', {
      correlationId,
      route: '/api/admin/discounts',
      method: 'GET',
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/discounts', 'GET', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Create discount. PHASE-10: Added observability.
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
        route: '/api/admin/discounts',
        method: 'POST',
      });
      recordRouteMetric('/api/admin/discounts', 'POST', false, Date.now() - startTime);
      return adminError;
    }
    
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { code, type, value, valid_from, valid_to, usage_limit } = body;
    
    logWithContext('info', 'Admin discount create request', {
      correlationId,
      route: '/api/admin/discounts',
      method: 'POST',
      userId,
      discountCode: code,
    });

    if (!code || !type || value === undefined) {
      recordRouteMetric('/api/admin/discounts', 'POST', false, Date.now() - startTime);
      return NextResponse.json(
        { success: false, error: "code, type, and value are required" },
        { status: 400 }
      );
    }

    // PHASE-10: Measure performance
    const { result: discountData, duration } = await measurePerformance(
      'admin.discounts.create',
      async () => {
        const { data: discount, error } = await supabase
          .from("discounts")
          .insert({
            code: code.toUpperCase(),
            type,
            value,
            valid_from: valid_from || new Date().toISOString(),
            valid_to,
            usage_limit,
            is_active: true,
          })
          .select()
          .single();

        if (error) throw error;
        return { discount };
      },
      { correlationId, route: '/api/admin/discounts', method: 'POST', userId, discountCode: code }
    );

    // Log audit
    await supabase.from("audit_logs").insert({
      action: "DISCOUNT_CREATED",
      new_value: { discount_id: discountData.discount.id, code, type, value },
    });

    logWithContext('info', 'Admin discount created', {
      correlationId,
      route: '/api/admin/discounts',
      method: 'POST',
      userId,
      discountId: discountData.discount.id,
      discountCode: code,
      duration,
    });

    recordRouteMetric('/api/admin/discounts', 'POST', true, duration);
    return NextResponse.json({ success: true, discount: discountData.discount });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin discount create failed', {
      correlationId,
      route: '/api/admin/discounts',
      method: 'POST',
      userId,
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/discounts', 'POST', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PUT: Update discount. PHASE-10: Added observability.
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
        route: '/api/admin/discounts',
        method: 'PUT',
      });
      recordRouteMetric('/api/admin/discounts', 'PUT', false, Date.now() - startTime);
      return adminError;
    }
    
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { id, code, type, value, valid_from, valid_to, usage_limit, is_active } = body;
    
    logWithContext('info', 'Admin discount update request', {
      correlationId,
      route: '/api/admin/discounts',
      method: 'PUT',
      userId,
      discountId: id,
    });

    if (!id) {
      recordRouteMetric('/api/admin/discounts', 'PUT', false, Date.now() - startTime);
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }

    // PHASE-10: Measure performance
    const { result: updateData, duration } = await measurePerformance(
      'admin.discounts.update',
      async () => {
        const { data: currentDiscount } = await supabase
          .from("discounts")
          .select("*")
          .eq("id", id)
          .single();

        if (!currentDiscount) {
          throw new Error("Discount not found");
        }

        const updates: any = {};
        if (code !== undefined) updates.code = code.toUpperCase();
        if (type !== undefined) updates.type = type;
        if (value !== undefined) updates.value = value;
        if (valid_from !== undefined) updates.valid_from = valid_from;
        if (valid_to !== undefined) updates.valid_to = valid_to;
        if (usage_limit !== undefined) updates.usage_limit = usage_limit;
        if (is_active !== undefined) updates.is_active = is_active;

        const { data: discount, error } = await supabase
          .from("discounts")
          .update(updates)
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return { currentDiscount, discount };
      },
      { correlationId, route: '/api/admin/discounts', method: 'PUT', userId, discountId: id }
    );

    // Log audit
    await supabase.from("audit_logs").insert({
      action: "DISCOUNT_UPDATED",
      old_value: updateData.currentDiscount,
      new_value: updateData.discount,
    });

    logWithContext('info', 'Admin discount updated', {
      correlationId,
      route: '/api/admin/discounts',
      method: 'PUT',
      userId,
      discountId: id,
      duration,
    });

    recordRouteMetric('/api/admin/discounts', 'PUT', true, duration);
    return NextResponse.json({ success: true, discount: updateData.discount });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin discount update failed', {
      correlationId,
      route: '/api/admin/discounts',
      method: 'PUT',
      userId,
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/discounts', 'PUT', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE: Delete discount (removes from database). PHASE-6: Requires confirmation and audit. PHASE-10: Added observability.
export async function DELETE(req: Request) {
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
        route: '/api/admin/discounts',
        method: 'DELETE',
      });
      recordRouteMetric('/api/admin/discounts', 'DELETE', false, Date.now() - startTime);
      return adminError;
    }
    
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const confirmation_token = searchParams.get('confirmation_token');
    
    logWithContext('info', 'Admin discount delete request', {
      correlationId,
      route: '/api/admin/discounts',
      method: 'DELETE',
      userId,
      discountId: id,
    });

    if (!id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }

    // Get discount before deletion for audit
    const { data: currentDiscount } = await supabase
      .from("discounts")
      .select("*")
      .eq("id", id)
      .single();

    if (!currentDiscount) {
      return NextResponse.json({ success: false, error: "Discount not found" }, { status: 404 });
    }

    // PHASE-6: Check if confirmation is required
    const action = "DISCOUNT_DELETE";
    const needsConfirmation = requiresConfirmation(action);

    if (needsConfirmation && !confirmation_token) {
      const token = generateConfirmationToken({
        userId: userId!,
        action,
        resourceId: id,
        metadata: { discount_id: id, code: currentDiscount.code },
      });
      
      logWithContext('info', 'Discount delete requires confirmation', {
        correlationId,
        route: '/api/admin/discounts',
        method: 'DELETE',
        userId,
        discountId: id,
        action,
      });
      
      return NextResponse.json({
        requires_confirmation: true,
        confirmation_token: token,
        message: "This action requires confirmation. Please include confirmation_token as query parameter.",
      }, { status: 200 });
    }

    // PHASE-6: Verify confirmation token if provided
    if (needsConfirmation && confirmation_token) {
      const verification = verifyConfirmationToken(confirmation_token, userId!, action);
      if (!verification.valid) {
        return NextResponse.json(
          { success: false, error: verification.error || "Invalid confirmation token" },
          { status: 400 }
        );
      }
    }

    // PHASE-10: Measure performance
    const { duration } = await measurePerformance(
      'admin.discounts.delete',
      async () => {
        // Remove all company assignments first
        await supabase
          .from("company_discounts")
          .delete()
          .eq("discount_id", id);

        // Delete the discount
        const { error } = await supabase
          .from("discounts")
          .delete()
          .eq("id", id);

        if (error) throw error;
      },
      { correlationId, route: '/api/admin/discounts', method: 'DELETE', userId, discountId: id }
    );

    // PHASE-6: Enhanced audit logging
    await logAdminAction({
      action: "DISCOUNT_DELETE",
      resourceType: "discount",
      resourceId: id,
      companyId: null,
      oldValue: currentDiscount,
      newValue: null,
      status: "success",
      requiresConfirmation: needsConfirmation,
      confirmationToken: confirmation_token ?? undefined,
      metadata: { deleted_at: new Date().toISOString() },
    });

    logWithContext('info', 'Admin discount deleted', {
      correlationId,
      route: '/api/admin/discounts',
      method: 'DELETE',
      userId,
      discountId: id,
      duration,
    });

    recordRouteMetric('/api/admin/discounts', 'DELETE', true, duration);
    return NextResponse.json({ success: true, message: "Discount deleted successfully" });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    
    logWithContext('error', 'Admin discount delete failed', {
      correlationId,
      route: '/api/admin/discounts',
      method: 'DELETE',
      userId,
      discountId: id,
      error: err.message || String(err),
      duration,
    });
    
    recordRouteMetric('/api/admin/discounts', 'DELETE', false, duration);
    
    // PHASE-6: Log failed action
    if (id) {
      try {
        const supabase = getSupabaseAdmin();
        const { data: currentDiscount } = await supabase
          .from("discounts")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        
        await logAdminAction({
          action: "DISCOUNT_DELETE",
          resourceType: "discount",
          resourceId: id,
          companyId: null,
          oldValue: currentDiscount || null,
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
