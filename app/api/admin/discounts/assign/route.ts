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

// POST: Assign discount code to company. PHASE-11: Added observability.
export async function POST(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;
  
  try {
    // PHASE-11: Generate correlation ID
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');
    
    // PHASE-1: Require admin access
    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin access denied', {
        correlationId,
        route: '/api/admin/discounts/assign',
        method: 'POST',
      });
      recordRouteMetric('/api/admin/discounts/assign', 'POST', false, Date.now() - startTime);
      return adminError;
    }
    
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { company_id, discount_id } = body;
    
    logWithContext('info', 'Admin discount assign request', {
      correlationId,
      route: '/api/admin/discounts/assign',
      method: 'POST',
      userId,
      companyId: company_id,
      discountId: discount_id,
    });

    if (!company_id || !discount_id) {
      recordRouteMetric('/api/admin/discounts/assign', 'POST', false, Date.now() - startTime);
      return NextResponse.json(
        { success: false, error: "company_id and discount_id are required" },
        { status: 400 }
      );
    }

    // PHASE-11: Measure performance
    const { result: assignmentData, duration } = await measurePerformance(
      'admin.discounts.assign.create',
      async () => {
        // Check if assignment already exists
        const { data: existing } = await supabase
          .from("company_discounts")
          .select("id")
          .eq("company_id", company_id)
          .eq("discount_id", discount_id)
          .maybeSingle();

        if (existing) {
          throw new Error("Discount already assigned to this company");
        }

        // Assign discount
        const { data: assignment, error } = await supabase
          .from("company_discounts")
          .insert({
            company_id,
            discount_id,
          })
          .select()
          .single();

        if (error) throw error;
        return { assignment };
      },
      { correlationId, route: '/api/admin/discounts/assign', method: 'POST', userId, companyId: company_id, discountId: discount_id }
    );

    // Log audit
    await supabase.from("audit_logs").insert({
      action: "DISCOUNT_ASSIGNED",
      new_value: { company_id, discount_id, assignment_id: assignmentData.assignment.id },
    });

    logWithContext('info', 'Admin discount assigned', {
      correlationId,
      route: '/api/admin/discounts/assign',
      method: 'POST',
      userId,
      companyId: company_id,
      discountId: discount_id,
      assignmentId: assignmentData.assignment.id,
      duration,
    });

    recordRouteMetric('/api/admin/discounts/assign', 'POST', true, duration);
    return NextResponse.json({ success: true, assignment: assignmentData.assignment });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin discount assign failed', {
      correlationId,
      route: '/api/admin/discounts/assign',
      method: 'POST',
      userId,
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/discounts/assign', 'POST', false, duration);
    
    // Return appropriate error response
    if (err.message === "Discount already assigned to this company") {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE: Remove discount assignment from company. PHASE-6: Requires confirmation and audit. PHASE-11: Added observability.
export async function DELETE(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;
  
  try {
    // PHASE-11: Generate correlation ID
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');
    
    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin access denied', {
        correlationId,
        route: '/api/admin/discounts/assign',
        method: 'DELETE',
      });
      recordRouteMetric('/api/admin/discounts/assign', 'DELETE', false, Date.now() - startTime);
      return adminError;
    }

    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get("company_id");
    const discount_id = searchParams.get("discount_id");
    const confirmation_token = searchParams.get("confirmation_token");
    
    logWithContext('info', 'Admin discount unassign request', {
      correlationId,
      route: '/api/admin/discounts/assign',
      method: 'DELETE',
      userId,
      companyId: company_id,
      discountId: discount_id,
    });

    if (!company_id || !discount_id) {
      return NextResponse.json(
        { success: false, error: "company_id and discount_id are required" },
        { status: 400 }
      );
    }

    const resourceId = `${company_id}:${discount_id}`;
    const action = "DISCOUNT_REMOVE";
    const needsConfirmation = requiresConfirmation(action);

    if (needsConfirmation && !confirmation_token) {
      const token = generateConfirmationToken({
        userId: userId!,
        action,
        resourceId,
        metadata: { company_id, discount_id },
      });
      
      logWithContext('info', 'Discount unassign requires confirmation', {
        correlationId,
        route: '/api/admin/discounts/assign',
        method: 'DELETE',
        userId,
        companyId: company_id,
        discountId: discount_id,
        action,
      });
      
      return NextResponse.json(
        {
          requires_confirmation: true,
          confirmation_token: token,
          message: "Include confirmation_token as query param to confirm.",
        },
        { status: 200 }
      );
    }

    if (needsConfirmation && confirmation_token) {
      const verification = verifyConfirmationToken(confirmation_token, userId!, action);
      if (!verification.valid) {
        return NextResponse.json(
          { success: false, error: verification.error || "Invalid confirmation token" },
          { status: 400 }
        );
      }
    }

    // PHASE-11: Measure performance
    const { result: unassignData, duration } = await measurePerformance(
      'admin.discounts.assign.remove',
      async () => {
        const { data: assignment } = await supabase
          .from("company_discounts")
          .select("*")
          .eq("company_id", company_id)
          .eq("discount_id", discount_id)
          .maybeSingle();

        if (!assignment) {
          throw new Error("Discount assignment not found");
        }

        const { error } = await supabase
          .from("company_discounts")
          .delete()
          .eq("company_id", company_id)
          .eq("discount_id", discount_id);

        if (error) throw error;
        return { assignment };
      },
      { correlationId, route: '/api/admin/discounts/assign', method: 'DELETE', userId, companyId: company_id, discountId: discount_id }
    );

    await logAdminAction({
      action: "DISCOUNT_UNASSIGNED",
      resourceType: "company_discount",
      resourceId: unassignData.assignment.id,
      companyId: company_id,
      oldValue: unassignData.assignment,
      newValue: null,
      status: "success",
      requiresConfirmation: needsConfirmation,
      confirmationToken: confirmation_token ?? undefined,
    });

    logWithContext('info', 'Admin discount unassigned', {
      correlationId,
      route: '/api/admin/discounts/assign',
      method: 'DELETE',
      userId,
      companyId: company_id,
      discountId: discount_id,
      assignmentId: unassignData.assignment.id,
      duration,
    });

    recordRouteMetric('/api/admin/discounts/assign', 'DELETE', true, duration);
    return NextResponse.json({ success: true, message: "Discount assignment removed successfully" });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    
    logWithContext('error', 'Admin discount unassign failed', {
      correlationId,
      route: '/api/admin/discounts/assign',
      method: 'DELETE',
      userId,
      companyId: company_id,
      discountId: discount_id,
      error: err.message || String(err),
      duration,
    });
    
    recordRouteMetric('/api/admin/discounts/assign', 'DELETE', false, duration);
    
    // Return appropriate error response
    if (err.message === "Discount assignment not found") {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 404 }
      );
    }
    
    // PHASE-6: Log failed action
    if (company_id && discount_id) {
      try {
        const supabase = getSupabaseAdmin();
        const { data: assignment } = await supabase
          .from("company_discounts")
          .select("*")
          .eq("company_id", company_id)
          .eq("discount_id", discount_id)
          .maybeSingle();
        
        await logAdminAction({
          action: "DISCOUNT_UNASSIGNED",
          resourceType: "company_discount",
          resourceId: assignment?.id,
          companyId: company_id,
          oldValue: assignment || null,
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

// GET: Get all companies assigned to a discount, or all discounts assigned to a company. PHASE-11: Added observability.
export async function GET(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;
  
  try {
    // PHASE-11: Generate correlation ID
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');
    
    logWithContext('info', 'Admin discount assignments list request', {
      correlationId,
      route: '/api/admin/discounts/assign',
      method: 'GET',
    });

    // PHASE-1: Require admin access
    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin access denied', {
        correlationId,
        route: '/api/admin/discounts/assign',
        method: 'GET',
      });
      recordRouteMetric('/api/admin/discounts/assign', 'GET', false, Date.now() - startTime);
      return adminError;
    }
    
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const discount_id = searchParams.get("discount_id");
    const company_id = searchParams.get("company_id");

    // PHASE-11: Measure performance
    const { result, duration } = await measurePerformance(
      'admin.discounts.assign.list',
      async () => {
        if (discount_id) {
          // Get all companies with this discount
          const { data, error } = await supabase
            .from("company_discounts")
            .select(`
              *,
              companies:company_id (
                id,
                company_name,
                contact_email
              )
            `)
            .eq("discount_id", discount_id);

          if (error) throw error;
          return { assignments: data || [] };
        } else if (company_id) {
          // Get all discounts for this company
          const { data, error } = await supabase
            .from("company_discounts")
            .select(`
              *,
              discounts:discount_id (
                id,
                code,
                type,
                value,
                is_active,
                valid_from,
                valid_to
              )
            `)
            .eq("company_id", company_id);

          if (error) throw error;
          return { assignments: data || [] };
        } else {
          throw new Error("discount_id or company_id is required");
        }
      },
      { correlationId, route: '/api/admin/discounts/assign', method: 'GET', userId, discountId: discount_id, companyId: company_id }
    );

    logWithContext('info', 'Admin discount assignments list completed', {
      correlationId,
      route: '/api/admin/discounts/assign',
      method: 'GET',
      userId,
      assignmentCount: result.assignments.length,
      discountId: discount_id,
      companyId: company_id,
      duration,
    });

    recordRouteMetric('/api/admin/discounts/assign', 'GET', true, duration);
    return NextResponse.json({ success: true, assignments: result.assignments });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin discount assignments list failed', {
      correlationId,
      route: '/api/admin/discounts/assign',
      method: 'GET',
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/discounts/assign', 'GET', false, duration);
    
    // Return appropriate error response
    if (err.message === "discount_id or company_id is required") {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
