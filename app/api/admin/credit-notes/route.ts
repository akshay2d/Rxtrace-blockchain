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

// GET: List credit notes. PHASE-10: Added observability.
export async function GET(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;
  
  try {
    // PHASE-10: Generate correlation ID
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');
    
    logWithContext('info', 'Admin credit notes list request', {
      correlationId,
      route: '/api/admin/credit-notes',
      method: 'GET',
    });

    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin access denied', {
        correlationId,
        route: '/api/admin/credit-notes',
        method: 'GET',
      });
      recordRouteMetric('/api/admin/credit-notes', 'GET', false, Date.now() - startTime);
      return adminError;
    }
    
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");

    // PHASE-10: Measure performance
    const { result, duration } = await measurePerformance(
      'admin.credit-notes.list',
      async () => {
        let query = supabase
          .from("credit_notes")
          .select(`
            *,
            companies!inner(id, company_name),
            users!credit_notes_created_by_fkey(id, email)
          `)
          .order("created_at", { ascending: false });

        if (companyId) {
          query = query.eq("company_id", companyId);
        }

        const { data, error } = await query.limit(100);
        if (error) throw error;
        return { credit_notes: data || [] };
      },
      { correlationId, route: '/api/admin/credit-notes', method: 'GET', userId, companyId }
    );

    logWithContext('info', 'Admin credit notes list completed', {
      correlationId,
      route: '/api/admin/credit-notes',
      method: 'GET',
      userId,
      creditNoteCount: result.credit_notes.length,
      companyId,
      duration,
    });

    recordRouteMetric('/api/admin/credit-notes', 'GET', true, duration);
    return NextResponse.json({ success: true, credit_notes: result.credit_notes });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin credit notes list failed', {
      correlationId,
      route: '/api/admin/credit-notes',
      method: 'GET',
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/credit-notes', 'GET', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Issue credit note. PHASE-6: Requires confirmation and audit. PHASE-10: Added observability.
export async function POST(req: Request) {
  const startTime = Date.now();
  let correlationId: string | null = null;
  let bodyCompanyId: string | null = null;
  let bodyAmount: number | null = null;
  
  try {
    // PHASE-10: Generate correlation ID
    const headersList = await headers();
    correlationId = getOrGenerateCorrelationId(headersList, 'admin');
    
    const { userId, error: adminError } = await requireAdmin();
    if (adminError) {
      logWithContext('warn', 'Admin access denied', {
        correlationId,
        route: '/api/admin/credit-notes',
        method: 'POST',
      });
      recordRouteMetric('/api/admin/credit-notes', 'POST', false, Date.now() - startTime);
      return adminError;
    }
    
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { company_id, amount, reason, confirmation_token } = body;
    bodyCompanyId = company_id;
    bodyAmount = amount;
    
    logWithContext('info', 'Admin credit note create request', {
      correlationId,
      route: '/api/admin/credit-notes',
      method: 'POST',
      userId,
      companyId: company_id,
      amount,
    });

    if (!company_id || !amount || !reason) {
      return NextResponse.json(
        { success: false, error: "company_id, amount, and reason are required" },
        { status: 400 }
      );
    }

    // PHASE-6: Check if confirmation is required
    const action = "CREDIT_NOTE_CREATE";
    const needsConfirmation = requiresConfirmation(action);

    if (needsConfirmation && !confirmation_token) {
      const token = generateConfirmationToken({
        userId: userId!,
        action,
        resourceId: company_id,
        metadata: { company_id, amount, reason },
      });
      
      logWithContext('info', 'Credit note create requires confirmation', {
        correlationId,
        route: '/api/admin/credit-notes',
        method: 'POST',
        userId,
        companyId: company_id,
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
    const { result: creditNoteData, duration } = await measurePerformance(
      'admin.credit-notes.create',
      async () => {
        // Get current user (admin)
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error("Unauthorized");
        }

        const { data: creditNote, error } = await supabase
          .from("credit_notes")
          .insert({
            company_id,
            amount,
            reason,
            created_by: user.id,
          })
          .select()
          .single();

        if (error) throw error;
        return { creditNote };
      },
      { correlationId, route: '/api/admin/credit-notes', method: 'POST', userId, companyId: company_id }
    );

    // PHASE-6: Enhanced audit logging
    await logAdminAction({
      action: "CREDIT_NOTE_CREATE",
      resourceType: "credit_note",
      resourceId: creditNoteData.creditNote.id,
      companyId: company_id,
      oldValue: null,
      newValue: creditNoteData.creditNote,
      status: "success",
      requiresConfirmation: needsConfirmation,
      confirmationToken: confirmation_token,
      metadata: { amount, reason },
    });

    logWithContext('info', 'Admin credit note created', {
      correlationId,
      route: '/api/admin/credit-notes',
      method: 'POST',
      userId,
      companyId: company_id,
      creditNoteId: creditNoteData.creditNote.id,
      amount,
      duration,
    });

    recordRouteMetric('/api/admin/credit-notes', 'POST', true, duration);
    return NextResponse.json({ success: true, credit_note: creditNoteData.creditNote });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    
    logWithContext('error', 'Admin credit note create failed', {
      correlationId,
      route: '/api/admin/credit-notes',
      method: 'POST',
      userId,
      error: err.message || String(err),
      duration,
    });
    
    recordRouteMetric('/api/admin/credit-notes', 'POST', false, duration);
    
    // PHASE-6: Log failed action
    if (bodyCompanyId) {
      try {
        await logAdminAction({
          action: "CREDIT_NOTE_CREATE",
          resourceType: "credit_note",
          resourceId: null,
          companyId: bodyCompanyId,
          oldValue: null,
          newValue: { amount: bodyAmount, reason },
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
