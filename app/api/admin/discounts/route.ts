import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// GET: List all discounts
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("discounts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ success: true, discounts: data || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Create discount
export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { code, type, value, valid_from, valid_to, usage_limit } = body;

    if (!code || !type || value === undefined) {
      return NextResponse.json(
        { success: false, error: "code, type, and value are required" },
        { status: 400 }
      );
    }

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

    // Log audit
    await supabase.from("audit_logs").insert({
      action: "DISCOUNT_CREATED",
      new_value: { discount_id: discount.id, code, type, value },
    });

    return NextResponse.json({ success: true, discount });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PUT: Update discount
export async function PUT(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { id, code, type, value, valid_from, valid_to, usage_limit, is_active } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }

    const { data: currentDiscount } = await supabase
      .from("discounts")
      .select("*")
      .eq("id", id)
      .single();

    if (!currentDiscount) {
      return NextResponse.json({ success: false, error: "Discount not found" }, { status: 404 });
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

    // Log audit
    await supabase.from("audit_logs").insert({
      action: "DISCOUNT_UPDATED",
      old_value: currentDiscount,
      new_value: discount,
    });

    return NextResponse.json({ success: true, discount });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
