import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// PUT: Set direct discount on company (using companies.discount_* fields)
export async function PUT(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { company_id, discount_type, discount_value, discount_applies_to, discount_notes } = body;

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
      return NextResponse.json(
        { success: false, error: "discount_applies_to must be 'subscription', 'addon', or 'both'" },
        { status: 400 }
      );
    }

    // Get current company data for audit
    const { data: currentCompany } = await supabase
      .from("companies")
      .select("id, company_name, discount_type, discount_value, discount_applies_to, discount_notes")
      .eq("id", company_id)
      .single();

    if (!currentCompany) {
      return NextResponse.json(
        { success: false, error: "Company not found" },
        { status: 404 }
      );
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

    // If all discount fields are being cleared, set them all to null
    if (discount_type === null && discount_value === null && discount_applies_to === null) {
      updates.discount_type = null;
      updates.discount_value = null;
      updates.discount_applies_to = null;
      updates.discount_notes = null;
    }

    // Update company
    const { data: updatedCompany, error } = await supabase
      .from("companies")
      .update(updates)
      .eq("id", company_id)
      .select("id, company_name, discount_type, discount_value, discount_applies_to, discount_notes")
      .single();

    if (error) throw error;

    // Log audit
    await supabase.from("audit_logs").insert({
      action: "COMPANY_DISCOUNT_UPDATED",
      company_id: company_id,
      old_value: {
        discount_type: currentCompany.discount_type,
        discount_value: currentCompany.discount_value,
        discount_applies_to: currentCompany.discount_applies_to,
        discount_notes: currentCompany.discount_notes,
      },
      new_value: {
        discount_type: updatedCompany.discount_type,
        discount_value: updatedCompany.discount_value,
        discount_applies_to: updatedCompany.discount_applies_to,
        discount_notes: updatedCompany.discount_notes,
      },
    });

    return NextResponse.json({ success: true, company: updatedCompany });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE: Remove direct discount from company (clear all discount fields)
export async function DELETE(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get("company_id");

    if (!company_id) {
      return NextResponse.json(
        { success: false, error: "company_id is required" },
        { status: 400 }
      );
    }

    // Get current company data for audit
    const { data: currentCompany } = await supabase
      .from("companies")
      .select("id, company_name, discount_type, discount_value, discount_applies_to, discount_notes")
      .eq("id", company_id)
      .single();

    if (!currentCompany) {
      return NextResponse.json(
        { success: false, error: "Company not found" },
        { status: 404 }
      );
    }

    // Clear all discount fields
    const { data: updatedCompany, error } = await supabase
      .from("companies")
      .update({
        discount_type: null,
        discount_value: null,
        discount_applies_to: null,
        discount_notes: null,
      })
      .eq("id", company_id)
      .select("id, company_name, discount_type, discount_value, discount_applies_to, discount_notes")
      .single();

    if (error) throw error;

    // Log audit
    await supabase.from("audit_logs").insert({
      action: "COMPANY_DISCOUNT_REMOVED",
      company_id: company_id,
      old_value: {
        discount_type: currentCompany.discount_type,
        discount_value: currentCompany.discount_value,
        discount_applies_to: currentCompany.discount_applies_to,
        discount_notes: currentCompany.discount_notes,
      },
      new_value: {
        discount_type: null,
        discount_value: null,
        discount_applies_to: null,
        discount_notes: null,
      },
    });

    return NextResponse.json({ success: true, message: "Company discount removed successfully", company: updatedCompany });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// GET: Get company discount details
export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get("company_id");

    if (!company_id) {
      return NextResponse.json(
        { success: false, error: "company_id is required" },
        { status: 400 }
      );
    }

    const { data: company, error } = await supabase
      .from("companies")
      .select("id, company_name, discount_type, discount_value, discount_applies_to, discount_notes")
      .eq("id", company_id)
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      discount: {
        discount_type: company.discount_type,
        discount_value: company.discount_value,
        discount_applies_to: company.discount_applies_to,
        discount_notes: company.discount_notes,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
