import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

function normalizeEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  // Simple and sufficient validation for UI/admin workflows
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

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

    const body = await req.json().catch(() => ({}));
    const seatId = body.seat_id as string | undefined;
    const targetEmail = normalizeEmail(body.email);
    const targetRole = body.role as string | undefined;

    if (!seatId) return NextResponse.json({ success: false, error: "seat_id required" }, { status: 400 });
    if (!targetEmail) return NextResponse.json({ success: false, error: "email required" }, { status: 400 });
    if (!isValidEmail(targetEmail)) {
      return NextResponse.json({ success: false, error: "Invalid email" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    const { data: seatRow, error: seatError } = await admin
      .from("seats")
      .select("id, company_id, email, role, status")
      .eq("id", seatId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (seatError) return NextResponse.json({ success: false, error: seatError.message }, { status: 500 });
    if (!seatRow) return NextResponse.json({ success: false, error: "Seat not found" }, { status: 404 });

    // Prevent duplicate seats for the same email in the same company
    const { data: duplicateSeat, error: dupError } = await admin
      .from("seats")
      .select("id")
      .eq("company_id", companyId)
      .eq("email", targetEmail)
      .neq("id", seatId)
      .maybeSingle();

    if (dupError) return NextResponse.json({ success: false, error: dupError.message }, { status: 500 });
    if (duplicateSeat) {
      return NextResponse.json({ success: false, error: "Another seat already exists for this email" }, { status: 400 });
    }

    const prevEmail = (seatRow as any)?.email ?? null;
    const prevStatus = String((seatRow as any)?.status ?? "").toLowerCase();

    // Reassign behavior:
    // - active -> pending (forces admin to activate after reassignment)
    // - pending -> pending
    // - inactive/other -> keep status (doesn't consume a slot until activated)
    const nextStatus = prevStatus === "active" ? "pending" : prevStatus === "pending" ? "pending" : prevStatus || "inactive";

    const now = new Date().toISOString();

    const update: Record<string, any> = {
      email: targetEmail,
      user_id: null,
      active: false,
      status: nextStatus,
      invited_at: now,
      activated_at: null,
    };

    if (typeof targetRole === "string" && targetRole.trim()) {
      update.role = targetRole.trim();
    }

    // If we kept inactive, invited_at is still useful (records when reassigned), but it won't activate.

    const { data: updated, error: updateError } = await admin
      .from("seats")
      .update(update)
      .eq("id", seatId)
      .eq("company_id", companyId)
      .select()
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ success: false, error: updateError?.message || "Failed to reassign" }, { status: 500 });
    }

    try {
      await writeAuditLog({
        companyId,
        actor: (user as any)?.email ?? (user as any)?.id ?? "unknown",
        action: "seat_reassigned",
        status: "success",
        metadata: { seat_id: seatId, from_email: prevEmail, to_email: targetEmail, from_status: prevStatus, to_status: nextStatus },
      });
    } catch {
      // ignore audit failures
    }

    return NextResponse.json({ success: true, seat: updated, message: "User ID reassigned" });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
