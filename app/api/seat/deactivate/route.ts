import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { seat_id } = body;

    if (!seat_id) return NextResponse.json({ success: false, error: "seat_id required" }, { status: 400 });

    const { data: seat, error } = await supabase
      .from("seats")
      .update({ active: false })
      .eq("id", seat_id)
      .select()
      .single();

    if (error || !seat) {
      return NextResponse.json({ success: false, error: error?.message || "Seat not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Seat deactivated", seat });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
