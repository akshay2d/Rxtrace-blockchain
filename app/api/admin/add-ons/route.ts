import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// GET: List all add-ons
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("add_ons")
      .select("*")
      .order("display_order", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ success: true, add_ons: data || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Create new add-on
export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { name, description, price, unit, recurring, display_order } = body;

    if (!name || price === undefined || !unit) {
      return NextResponse.json(
        { success: false, error: "name, price, and unit are required" },
        { status: 400 }
      );
    }

    const { data: addOn, error } = await supabase
      .from("add_ons")
      .insert({
        name,
        description,
        price,
        unit,
        recurring: recurring === true,
        display_order: display_order ?? 0,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    // Log audit
    await supabase.from("audit_logs").insert({
      action: "ADD_ON_CREATED",
      new_value: { add_on_id: addOn.id, name, price, unit, recurring },
    });

    return NextResponse.json({ success: true, add_on: addOn });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PUT: Update add-on
export async function PUT(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { id, name, description, price, unit, recurring, display_order, is_active } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    }

    // Get current add-on
    const { data: currentAddOn } = await supabase
      .from("add_ons")
      .select("*")
      .eq("id", id)
      .single();

    if (!currentAddOn) {
      return NextResponse.json({ success: false, error: "Add-on not found" }, { status: 404 });
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (price !== undefined) updates.price = price;
    if (unit !== undefined) updates.unit = unit;
    if (recurring !== undefined) updates.recurring = recurring;
    if (display_order !== undefined) updates.display_order = display_order;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data: addOn, error } = await supabase
      .from("add_ons")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Log audit
    await supabase.from("audit_logs").insert({
      action: "ADD_ON_UPDATED",
      old_value: currentAddOn,
      new_value: addOn,
    });

    return NextResponse.json({ success: true, add_on: addOn });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
