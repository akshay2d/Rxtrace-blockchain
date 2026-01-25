import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// GET: Public API - Fetch active add-ons
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("add_ons")
      .select("id, name, description, price, unit, recurring")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ success: true, add_ons: data || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
