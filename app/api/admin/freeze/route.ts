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

export async function POST(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;
  
  try {
    // PHASE-10: Generate correlation ID
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');
    
    // PHASE-1: Require admin access
    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin access denied', {
        correlationId,
        route: '/api/admin/freeze',
        method: 'POST',
      });
      recordRouteMetric('/api/admin/freeze', 'POST', false, Date.now() - startTime);
      return adminError;
    }
    
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { company_id, status, confirmation_token } = body;
    
    logWithContext('info', 'Admin freeze request', {
      correlationId,
      route: '/api/admin/freeze',
      method: 'POST',
      userId,
      companyId: company_id,
      status,
    });

    if (!company_id || !status) {
      return NextResponse.json(
        { error: "company_id and status are required" },
        { status: 400 }
      );
    }

    if (!["ACTIVE", "FROZEN"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be ACTIVE or FROZEN" },
        { status: 400 }
      );
    }

    // PHASE-2: Check if confirmation is required
    const action = status === "FROZEN" ? "COMPANY_FREEZE" : "COMPANY_UNFREEZE";
    const needsConfirmation = requiresConfirmation(action);
    
    if (needsConfirmation && !confirmation_token) {
      // PHASE-2: Generate confirmation token and return it
      const token = generateConfirmationToken({
        userId,
        action,
        resourceId: company_id,
        metadata: { company_id, status },
      });
      
      logWithContext('info', 'Freeze action requires confirmation', {
        correlationId,
        route: '/api/admin/freeze',
        method: 'POST',
        userId,
        companyId: company_id,
        action,
        status,
      });
      
      return NextResponse.json({
        requires_confirmation: true,
        confirmation_token: token,
        message: "This action requires confirmation. Please confirm by including the confirmation_token in your request.",
      }, { status: 200 });
    }
    
    // PHASE-2: Verify confirmation token if provided
    if (needsConfirmation && confirmation_token) {
      const verification = verifyConfirmationToken(confirmation_token, userId, action);
      if (!verification.valid) {
        return NextResponse.json(
          { error: verification.error || "Invalid confirmation token" },
          { status: 400 }
        );
      }
    }

    // PHASE-10: Measure performance
    const { result: freezeData, duration } = await measurePerformance(
      'admin.freeze.toggle',
      async () => {
        // Get current status before update (for audit)
        const { data: currentWallet } = await supabase
          .from("company_wallets")
          .select("status")
          .eq("company_id", company_id)
          .maybeSingle();

        const oldStatus = currentWallet?.status || "ACTIVE";

        // Update wallet status (freeze/unfreeze only - no balance changes)
        const { error } = await supabase
          .from("company_wallets")
          .upsert({
            company_id,
            status,
            updated_at: new Date().toISOString(),
          });

        if (error) throw error;
        return { oldStatus };
      },
      { correlationId, route: '/api/admin/freeze', method: 'POST', userId, companyId: company_id, status }
    );

    // PHASE-2: Enhanced audit logging with full context
    await logAdminAction({
      action: "COMPANY_FREEZE_TOGGLED",
      resourceType: "company_wallet",
      resourceId: company_id,
      companyId: company_id,
      oldValue: { status: freezeData.oldStatus },
      newValue: { status },
      status: 'success',
      requiresConfirmation: needsConfirmation,
      confirmationToken: confirmation_token,
    });

    logWithContext('info', 'Admin freeze action completed', {
      correlationId,
      route: '/api/admin/freeze',
      method: 'POST',
      userId,
      companyId: company_id,
      oldStatus: freezeData.oldStatus,
      newStatus: status,
      duration,
    });

    recordRouteMetric('/api/admin/freeze', 'POST', true, duration);
    return NextResponse.json({
      success: true,
      message: `Company ${status === "FROZEN" ? "frozen" : "activated"} successfully`,
    });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    
    logWithContext('error', 'Admin freeze action failed', {
      correlationId,
      route: '/api/admin/freeze',
      method: 'POST',
      userId,
      companyId: company_id,
      error: err.message || String(err),
      duration,
    });
    
    recordRouteMetric('/api/admin/freeze', 'POST', false, duration);
    
    // PHASE-2: Log failed action
    try {
      const body = await req.json().catch(() => ({}));
      await logAdminAction({
        action: "COMPANY_FREEZE_TOGGLED",
        resourceType: "company_wallet",
        resourceId: body.company_id,
        companyId: body.company_id,
        oldValue: null,
        newValue: { status: body.status },
        status: 'failed',
        metadata: { error: err.message || String(err) },
      });
    } catch (auditErr) {
      // Don't fail if audit logging fails
    }
    
    return NextResponse.json(
      { error: err.message || "Failed to update status" },
      { status: 500 }
    );
  }
}
