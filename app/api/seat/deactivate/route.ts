import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";

async function resolveAuthCompanyId() {
  const supabase = supabaseServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return { user: null as any, companyId: null as string | null };

  const admin = getSupabaseAdmin();
  const { data: company } = await admin
    .from("companies")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  return { user, companyId: (company as any)?.id ?? null };
}

export async function POST(req: Request) {
  try {
    const { user, companyId } = await resolveAuthCompanyId();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!companyId) return NextResponse.json({ success: false, error: "No company found" }, { status: 403 });

    const admin = getSupabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const seatId = body.seat_id as string | undefined;

    if (!seatId) return NextResponse.json({ success: false, error: "seat_id required" }, { status: 400 });

    // Verify seat belongs to this company
    const { data: seatRow, error: seatError } = await admin
      .from("seats")
      .select("id, company_id, status")
      .eq("id", seatId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (seatError) {
      return NextResponse.json({ success: false, error: seatError.message }, { status: 500 });
    }
    if (!seatRow) {
      return NextResponse.json({ success: false, error: "Seat not found" }, { status: 404 });
    }

    const { data: seat, error } = await admin
      .from("seats")
      .update({ active: false, status: "inactive" })
      .eq("id", seatId)
      .eq("company_id", companyId)
      .select()
      .single();

    if (error || !seat) {
      return NextResponse.json({ success: false, error: error?.message || "Seat not found" }, { status: 404 });
    }

    try {
      await writeAuditLog({
        companyId,
        actor: (user as any)?.email ?? (user as any)?.id ?? "unknown",
        action: "seat_deactivated",
        status: "success",
        metadata: { seat_id: seatId },
      });
    } catch {
      // ignore audit failures
    }

    return NextResponse.json({ success: true, message: "Seat deactivated", seat });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
