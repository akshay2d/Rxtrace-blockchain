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

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay not configured");
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// GET: List refunds. PHASE-10: Added observability.
export async function GET(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;
  
  try {
    // PHASE-10: Generate correlation ID
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');
    
    logWithContext('info', 'Admin refunds list request', {
      correlationId,
      route: '/api/admin/refunds',
      method: 'GET',
    });

    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin access denied', {
        correlationId,
        route: '/api/admin/refunds',
        method: 'GET',
      });
      recordRouteMetric('/api/admin/refunds', 'GET', false, Date.now() - startTime);
      return adminError;
    }
    
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");

    // PHASE-10: Measure performance
    const { result, duration } = await measurePerformance(
      'admin.refunds.list',
      async () => {
        let query = supabase
          .from("refunds")
          .select(`
            *,
            companies!inner(id, company_name)
          `)
          .order("created_at", { ascending: false });

        if (companyId) {
          query = query.eq("company_id", companyId);
        }

        const { data, error } = await query.limit(100);
        if (error) throw error;
        return { refunds: data || [] };
      },
      { correlationId, route: '/api/admin/refunds', method: 'GET', userId, companyId }
    );

    logWithContext('info', 'Admin refunds list completed', {
      correlationId,
      route: '/api/admin/refunds',
      method: 'GET',
      userId,
      refundCount: result.refunds.length,
      companyId,
      duration,
    });

    recordRouteMetric('/api/admin/refunds', 'GET', true, duration);
    return NextResponse.json({ success: true, refunds: result.refunds });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin refunds list failed', {
      correlationId,
      route: '/api/admin/refunds',
      method: 'GET',
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/refunds', 'GET', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Initiate refund. PHASE-6: Requires confirmation and audit. PHASE-10: Added observability.
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
        route: '/api/admin/refunds',
        method: 'POST',
      });
      recordRouteMetric('/api/admin/refunds', 'POST', false, Date.now() - startTime);
      return adminError;
    }
    
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { company_id, razorpay_payment_id, amount, reason, confirmation_token } = body;
    
    logWithContext('info', 'Admin refund process request', {
      correlationId,
      route: '/api/admin/refunds',
      method: 'POST',
      userId,
      companyId: company_id,
      paymentId: razorpay_payment_id,
      amount,
    });

    if (!company_id || !razorpay_payment_id || !amount || !reason) {
      return NextResponse.json(
        { success: false, error: "company_id, razorpay_payment_id, amount, and reason are required" },
        { status: 400 }
      );
    }

    // PHASE-6: Check if confirmation is required
    const action = "REFUND_PROCESS";
    const needsConfirmation = requiresConfirmation(action);

    if (needsConfirmation && !confirmation_token) {
      const token = generateConfirmationToken({
        userId: userId!,
        action,
        resourceId: razorpay_payment_id,
        metadata: { company_id, razorpay_payment_id, amount, reason },
      });
      
      logWithContext('info', 'Refund process requires confirmation', {
        correlationId,
        route: '/api/admin/refunds',
        method: 'POST',
        userId,
        companyId: company_id,
        paymentId: razorpay_payment_id,
        action,
      });
      
      return NextResponse.json({
        requires_confirmation: true,
        confirmation_token: token,
        message: "This action requires confirmation. Please include confirmation_token in the request body.",
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
    const { result: refundData, duration } = await measurePerformance(
      'admin.refunds.process',
      async () => {
        // Create refund record
        const { data: refund, error: refundError } = await supabase
          .from("refunds")
          .insert({
            company_id,
            razorpay_payment_id,
            amount,
            reason,
            status: "PENDING",
          })
          .select()
          .single();

        if (refundError) {
          // PHASE-6: Log failed action
          await logAdminAction({
            action: "REFUND_PROCESS",
            resourceType: "refund",
            resourceId: null,
            companyId: company_id,
            oldValue: null,
            newValue: { razorpay_payment_id, amount, reason },
            status: "failed",
            metadata: { error: refundError.message },
          });
          throw refundError;
        }

        // Initiate Razorpay refund
        try {
          const razorpay = getRazorpay();
          const razorpayRefund = await razorpay.payments.refund(razorpay_payment_id, {
            amount: Math.round(amount * 100), // Convert to paise
            notes: { reason },
          });

          // Update refund record
          await supabase
            .from("refunds")
            .update({
              razorpay_refund_id: razorpayRefund.id,
              status: razorpayRefund.status === "processed" ? "SUCCESS" : "PROCESSING",
            })
            .eq("id", refund.id);
        } catch (razorpayErr: any) {
          // Update status to failed
          await supabase
            .from("refunds")
            .update({ status: "FAILED" })
            .eq("id", refund.id);

          // PHASE-6: Log failed action
          await logAdminAction({
            action: "REFUND_PROCESS",
            resourceType: "refund",
            resourceId: refund.id,
            companyId: company_id,
            oldValue: null,
            newValue: { refund_id: refund.id, amount, reason, razorpay_payment_id },
            status: "failed",
            metadata: { error: `Razorpay refund failed: ${razorpayErr.message}` },
          });

          throw new Error(`Razorpay refund failed: ${razorpayErr.message}`);
        }

        // Get updated refund
        const { data: updatedRefund } = await supabase
          .from("refunds")
          .select("*")
          .eq("id", refund.id)
          .single();

        return { refund: updatedRefund };
      },
      { correlationId, route: '/api/admin/refunds', method: 'POST', userId, companyId: company_id, paymentId: razorpay_payment_id }
    );

    // PHASE-6: Enhanced audit logging
    await logAdminAction({
      action: "REFUND_PROCESS",
      resourceType: "refund",
      resourceId: refundData.refund.id,
      companyId: company_id,
      oldValue: null,
      newValue: refundData.refund,
      status: "success",
      requiresConfirmation: needsConfirmation,
      confirmationToken: confirmation_token,
      metadata: { razorpay_payment_id, amount, reason },
    });

    logWithContext('info', 'Admin refund processed', {
      correlationId,
      route: '/api/admin/refunds',
      method: 'POST',
      userId,
      companyId: company_id,
      refundId: refundData.refund.id,
      amount,
      duration,
    });

    recordRouteMetric('/api/admin/refunds', 'POST', true, duration);
    return NextResponse.json({ success: true, refund: refundData.refund });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    
    logWithContext('error', 'Admin refund process failed', {
      correlationId,
      route: '/api/admin/refunds',
      method: 'POST',
      userId,
      error: err.message || String(err),
      duration,
    });
    
    recordRouteMetric('/api/admin/refunds', 'POST', false, duration);
    
    return NextResponse.json(
      { success: false, error: err.message || 'Razorpay refund failed' },
      { status: 500 }
    );
  }
}
