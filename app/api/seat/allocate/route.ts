import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { canCreateSeat } from "@/lib/usage/seats";
import { resolveCompanyIdFromRequest } from "@/lib/company/resolve";

export async function POST(req: Request) {
  try {
    const authCompanyId = await resolveCompanyIdFromRequest(req);
    if (!authCompanyId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { company_id: requestedCompanyId } = body;

    if (requestedCompanyId && requestedCompanyId !== authCompanyId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const company_id = authCompanyId;

    // Enforce seat limits using subscription system
    const seatCheck = await canCreateSeat(supabase, company_id);
    if (!seatCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: seatCheck.reason || 'Seat limit reached',
          max_seats: seatCheck.max_seats,
          used_seats: seatCheck.used_seats,
          available_seats: seatCheck.available_seats,
        },
        { status: 403 }
      );
    }

    // Create a new seat for the company
    const { data: seat, error } = await supabase
      .from("seats")
      .insert({
        company_id,
        active: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Seat allocated", seat });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
