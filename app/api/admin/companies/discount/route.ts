import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { logAdminAction } from "@/lib/audit/admin";
import {
  getOrGenerateCorrelationId,
  logWithContext,
  measurePerformance,
  recordRouteMetric,
} from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT: Set direct discount on company (using companies.discount_* fields). PHASE-10: Added observability.
export async function PUT(req: Request) {
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
        route: '/api/admin/companies/discount',
        method: 'PUT',
      });
      recordRouteMetric('/api/admin/companies/discount', 'PUT', false, Date.now() - startTime);
      return adminError;
    }
    
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { company_id, discount_type, discount_value, discount_applies_to, discount_notes, razorpay_offer_id } = body;
    
    logWithContext('info', 'Admin company discount update request', {
      correlationId,
      route: '/api/admin/companies/discount',
      method: 'PUT',
      userId,
      companyId: company_id,
    });

    if (!company_id) {
      return NextResponse.json(
        { success: false, error: "company_id is required" },
        { status: 400 }
      );
    }

    // Validate discount_type
    if (discount_type && !['percentage', 'flat'].includes(discount_type)) {
      return NextResponse.json(
        { success: false, error: "discount_type must be 'percentage' or 'flat'" },
        { status: 400 }
      );
    }

    // Validate discount_value
    if (discount_value !== undefined && discount_value !== null) {
      const numValue = Number(discount_value);
      if (isNaN(numValue) || numValue < 0) {
        return NextResponse.json(
          { success: false, error: "discount_value must be a positive number" },
          { status: 400 }
        );
      }
      if (discount_type === 'percentage' && numValue > 100) {
        return NextResponse.json(
          { success: false, error: "Percentage discount cannot exceed 100%" },
          { status: 400 }
        );
      }
    }

    // Validate discount_applies_to
    if (discount_applies_to && !['subscription', 'addon', 'both'].includes(discount_applies_to)) {
      recordRouteMetric('/api/admin/companies/discount', 'PUT', false, Date.now() - startTime);
      return NextResponse.json(
        { success: false, error: "discount_applies_to must be 'subscription', 'addon', or 'both'" },
        { status: 400 }
      );
    }

    // PHASE-10: Measure performance
    const { result: updateData, duration } = await measurePerformance(
      'admin.companies.discount.update',
      async () => {
        // Get current company data for audit
        const { data: currentCompany } = await supabase
          .from("companies")
          .select("id, company_name, discount_type, discount_value, discount_applies_to, discount_notes, razorpay_offer_id")
          .eq("id", company_id)
          .single();

        if (!currentCompany) {
          throw new Error("Company not found");
        }

        // Build update object
        const updates: any = {};
        if (discount_type !== undefined) {
          updates.discount_type = discount_type || null;
        }
        if (discount_value !== undefined) {
          updates.discount_value = discount_value || null;
        }
        if (discount_applies_to !== undefined) {
          updates.discount_applies_to = discount_applies_to || null;
        }
        if (discount_notes !== undefined) {
          updates.discount_notes = discount_notes || null;
        }
        if (razorpay_offer_id !== undefined) {
          updates.razorpay_offer_id = razorpay_offer_id && String(razorpay_offer_id).trim() ? String(razorpay_offer_id).trim() : null;
        }

        // If all discount fields are being cleared, set them all to null
        if (discount_type === null && discount_value === null && discount_applies_to === null) {
          updates.discount_type = null;
          updates.discount_value = null;
          updates.discount_applies_to = null;
          updates.discount_notes = null;
          updates.razorpay_offer_id = null;
        }

        // Update company
        const { data: updatedCompany, error } = await supabase
          .from("companies")
          .update(updates)
          .eq("id", company_id)
          .select("id, company_name, discount_type, discount_value, discount_applies_to, discount_notes, razorpay_offer_id")
          .single();

        if (error) throw error;
        return { currentCompany, updatedCompany };
      },
      { correlationId, route: '/api/admin/companies/discount', method: 'PUT', userId, companyId: company_id }
    );

    // PHASE-2: Enhanced audit logging
    await logAdminAction({
      action: "COMPANY_DISCOUNT_UPDATED",
      resourceType: "company",
      resourceId: company_id,
      companyId: company_id,
      oldValue: {
        discount_type: updateData.currentCompany.discount_type,
        discount_value: updateData.currentCompany.discount_value,
        discount_applies_to: updateData.currentCompany.discount_applies_to,
        discount_notes: updateData.currentCompany.discount_notes,
        razorpay_offer_id: (updateData.currentCompany as any).razorpay_offer_id,
      },
      newValue: {
        discount_type: updateData.updatedCompany.discount_type,
        discount_value: updateData.updatedCompany.discount_value,
        discount_applies_to: updateData.updatedCompany.discount_applies_to,
        discount_notes: updateData.updatedCompany.discount_notes,
        razorpay_offer_id: (updateData.updatedCompany as any).razorpay_offer_id,
      },
      status: 'success',
    });

    logWithContext('info', 'Admin company discount updated', {
      correlationId,
      route: '/api/admin/companies/discount',
      method: 'PUT',
      userId,
      companyId: company_id,
      duration,
    });

    recordRouteMetric('/api/admin/companies/discount', 'PUT', true, duration);
    return NextResponse.json({ success: true, company: updateData.updatedCompany });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin company discount update failed', {
      correlationId,
      route: '/api/admin/companies/discount',
      method: 'PUT',
      userId,
      companyId: company_id,
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/companies/discount', 'PUT', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE: Remove direct discount from company (clear all discount fields). PHASE-10: Added observability.
export async function DELETE(req: Request) {
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
        route: '/api/admin/companies/discount',
        method: 'DELETE',
      });
      recordRouteMetric('/api/admin/companies/discount', 'DELETE', false, Date.now() - startTime);
      return adminError;
    }
    
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get("company_id");
    const confirmation_token = searchParams.get("confirmation_token");
    
    logWithContext('info', 'Admin company discount remove request', {
      correlationId,
      route: '/api/admin/companies/discount',
      method: 'DELETE',
      userId,
      companyId: company_id,
    });

    if (!company_id) {
      return NextResponse.json(
        { success: false, error: "company_id is required" },
        { status: 400 }
      );
    }

    // PHASE-2: Check if confirmation is required
    const { requiresConfirmation, generateConfirmationToken, verifyConfirmationToken } = await import("@/lib/auth/confirmation");
    const action = "DISCOUNT_REMOVE";
    const needsConfirmation = requiresConfirmation(action);
    
    if (needsConfirmation && !confirmation_token) {
      const token = generateConfirmationToken({
        userId,
        action,
        resourceId: company_id,
      });
      
      logWithContext('info', 'Company discount remove requires confirmation', {
        correlationId,
        route: '/api/admin/companies/discount',
        method: 'DELETE',
        userId,
        companyId: company_id,
        action,
      });
      
      return NextResponse.json({
        requires_confirmation: true,
        confirmation_token: token,
        message: "Removing discount requires confirmation. Please include confirmation_token as query parameter.",
      }, { status: 200 });
    }
    
    // PHASE-2: Verify confirmation token if provided
    if (needsConfirmation && confirmation_token) {
      const verification = verifyConfirmationToken(confirmation_token, userId, action);
      if (!verification.valid) {
        return NextResponse.json(
          { success: false, error: verification.error || "Invalid confirmation token" },
          { status: 400 }
        );
      }
    }

    // Get current company data for audit
    const { data: currentCompany } = await supabase
      .from("companies")
      .select("id, company_name, discount_type, discount_value, discount_applies_to, discount_notes, razorpay_offer_id")
      .eq("id", company_id)
      .single();

    if (!currentCompany) {
      return NextResponse.json(
        { success: false, error: "Company not found" },
        { status: 404 }
      );
    }

    // PHASE-10: Measure performance
    const { result: removeData, duration } = await measurePerformance(
      'admin.companies.discount.remove',
      async () => {
        // Clear all discount fields
        const { data: updatedCompany, error } = await supabase
          .from("companies")
          .update({
            discount_type: null,
            discount_value: null,
            discount_applies_to: null,
            discount_notes: null,
            razorpay_offer_id: null,
          })
          .eq("id", company_id)
          .select("id, company_name, discount_type, discount_value, discount_applies_to, discount_notes, razorpay_offer_id")
          .single();

        if (error) throw error;
        return { updatedCompany };
      },
      { correlationId, route: '/api/admin/companies/discount', method: 'DELETE', userId, companyId: company_id }
    );

    // PHASE-2: Enhanced audit logging
    await logAdminAction({
      action: "COMPANY_DISCOUNT_REMOVED",
      resourceType: "company",
      resourceId: company_id,
      companyId: company_id,
      oldValue: {
        discount_type: currentCompany.discount_type,
        discount_value: currentCompany.discount_value,
        discount_applies_to: currentCompany.discount_applies_to,
        discount_notes: currentCompany.discount_notes,
        razorpay_offer_id: (currentCompany as any).razorpay_offer_id,
      },
      newValue: {
        discount_type: null,
        discount_value: null,
        discount_applies_to: null,
        discount_notes: null,
        razorpay_offer_id: null,
      },
      status: 'success',
      requiresConfirmation: needsConfirmation,
      confirmationToken: confirmation_token || undefined,
    });

    logWithContext('info', 'Admin company discount removed', {
      correlationId,
      route: '/api/admin/companies/discount',
      method: 'DELETE',
      userId,
      companyId: company_id,
      duration,
    });

    recordRouteMetric('/api/admin/companies/discount', 'DELETE', true, duration);
    return NextResponse.json({ success: true, message: "Company discount removed successfully", company: removeData.updatedCompany });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin company discount remove failed', {
      correlationId,
      route: '/api/admin/companies/discount',
      method: 'DELETE',
      userId,
      companyId: company_id,
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/companies/discount', 'DELETE', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// GET: Get company discount details. PHASE-10: Added observability.
export async function GET(req: Request) {
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
        route: '/api/admin/companies/discount',
        method: 'GET',
      });
      recordRouteMetric('/api/admin/companies/discount', 'GET', false, Date.now() - startTime);
      return adminError;
    }
    
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get("company_id");
    
    logWithContext('info', 'Admin company discount get request', {
      correlationId,
      route: '/api/admin/companies/discount',
      method: 'GET',
      userId,
      companyId: company_id,
    });

    if (!company_id) {
      return NextResponse.json(
        { success: false, error: "company_id is required" },
        { status: 400 }
      );
    }

    // PHASE-10: Measure performance
    const { result, duration } = await measurePerformance(
      'admin.companies.discount.get',
      async () => {
        const { data: company, error } = await supabase
          .from("companies")
          .select("id, company_name, discount_type, discount_value, discount_applies_to, discount_notes, razorpay_offer_id")
          .eq("id", company_id)
          .single();

        if (error) throw error;
        return {
          discount: {
            discount_type: company.discount_type,
            discount_value: company.discount_value,
            discount_applies_to: company.discount_applies_to,
            discount_notes: company.discount_notes,
            razorpay_offer_id: (company as any).razorpay_offer_id,
          },
        };
      },
      { correlationId, route: '/api/admin/companies/discount', method: 'GET', userId, companyId: company_id }
    );

    logWithContext('info', 'Admin company discount retrieved', {
      correlationId,
      route: '/api/admin/companies/discount',
      method: 'GET',
      userId,
      companyId: company_id,
      duration,
    });

    recordRouteMetric('/api/admin/companies/discount', 'GET', true, duration);
    return NextResponse.json({
      success: true,
      discount: result.discount,
    });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', 'Admin company discount get failed', {
      correlationId,
      route: '/api/admin/companies/discount',
      method: 'GET',
      userId,
      companyId: company_id,
      error: err.message || String(err),
      duration,
    });
    recordRouteMetric('/api/admin/companies/discount', 'GET', false, duration);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
