import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// POST: Assign discount code to company
export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { company_id, discount_id } = body;

    if (!company_id || !discount_id) {
      return NextResponse.json(
        { success: false, error: "company_id and discount_id are required" },
        { status: 400 }
      );
    }

    // Check if assignment already exists
    const { data: existing } = await supabase
      .from("company_discounts")
      .select("id")
      .eq("company_id", company_id)
      .eq("discount_id", discount_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { success: false, error: "Discount already assigned to this company" },
        { status: 409 }
      );
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

    // Log audit
    await supabase.from("audit_logs").insert({
      action: "DISCOUNT_ASSIGNED",
      new_value: { company_id, discount_id, assignment_id: assignment.id },
    });

    return NextResponse.json({ success: true, assignment });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE: Remove discount assignment from company
export async function DELETE(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get("company_id");
    const discount_id = searchParams.get("discount_id");

    if (!company_id || !discount_id) {
      return NextResponse.json(
        { success: false, error: "company_id and discount_id are required" },
        { status: 400 }
      );
    }

    // Get assignment before deletion for audit
    const { data: assignment } = await supabase
      .from("company_discounts")
      .select("*")
      .eq("company_id", company_id)
      .eq("discount_id", discount_id)
      .maybeSingle();

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: "Discount assignment not found" },
        { status: 404 }
      );
    }

    // Remove assignment
    const { error } = await supabase
      .from("company_discounts")
      .delete()
      .eq("company_id", company_id)
      .eq("discount_id", discount_id);

    if (error) throw error;

    // Log audit
    await supabase.from("audit_logs").insert({
      action: "DISCOUNT_UNASSIGNED",
      old_value: assignment,
      metadata: { removed_at: new Date().toISOString() },
    });

    return NextResponse.json({ success: true, message: "Discount assignment removed successfully" });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// GET: Get all companies assigned to a discount, or all discounts assigned to a company
export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const discount_id = searchParams.get("discount_id");
    const company_id = searchParams.get("company_id");

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
      return NextResponse.json({ success: true, assignments: data || [] });
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
      return NextResponse.json({ success: true, assignments: data || [] });
    } else {
      return NextResponse.json(
        { success: false, error: "discount_id or company_id is required" },
        { status: 400 }
      );
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
