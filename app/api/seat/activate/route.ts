import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { PRICING, type PlanType } from "@/lib/billingConfig";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

function normalizePlanType(raw: unknown): PlanType | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "starter") return "starter";
  if (value === "professional" || value === "pro" || value === "growth") return "growth";
  if (value === "enterprise") return "enterprise";
  return null;
}

async function resolveCompanyPlanType(supabase: ReturnType<typeof getSupabaseAdmin>, companyId: string): Promise<PlanType | null> {
  const { data: companyRow } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .maybeSingle();

  const planRaw =
    (companyRow as any)?.plan ??
    (companyRow as any)?.plan_type ??
    (companyRow as any)?.subscription_plan ??
    (companyRow as any)?.tier;

  return normalizePlanType(planRaw);
}

async function resolveAuthCompanyId() {
  const supabase = await supabaseServer();
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
    const body = await req.json().catch(() => ({}));
    const seatId = body.seat_id as string | undefined;
    const requestedCompanyId = body.company_id as string | undefined;

    if (!seatId) {
      return NextResponse.json({ success: false, error: "seat_id required" }, { status: 400 });
    }

    const { user, companyId } = await resolveAuthCompanyId();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!companyId) return NextResponse.json({ success: false, error: "No company found" }, { status: 403 });

    if (requestedCompanyId && requestedCompanyId !== companyId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();

    // Check seat belongs to company
    const { data: seatRow, error: seatError } = await supabase
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

    // If already active, no-op
    if ((seatRow as any).status === "active") {
      return NextResponse.json({ success: true, seat: seatRow, message: "Already active" });
    }

    const { data: companyRow } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .maybeSingle();

    const planType = await resolveCompanyPlanType(supabase, companyId);
    const baseMax = planType ? PRICING.plans[planType].max_seats : 1;
    const extra = Number((companyRow as any)?.extra_user_seats ?? 0);
    const maxSeats = baseMax + (Number.isFinite(extra) ? extra : 0);

    // Used seats = active + pending
    const { count: usedSeats, error: countError } = await supabase
      .from("seats")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", ["active", "pending"]);

    if (countError) {
      return NextResponse.json({ success: false, error: countError.message }, { status: 500 });
    }

    if ((usedSeats ?? 0) >= maxSeats) {
      return NextResponse.json(
        {
          success: false,
          error: `User ID limit reached. Current plan allows ${maxSeats} User ID(s).`,
          requires_payment: true,
          max_seats: maxSeats,
          used_seats: usedSeats ?? 0,
          plan: planType ?? "starter",
        },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from("seats")
      .update({ status: "active", active: true, activated_at: now })
      .eq("id", seatId)
      .select()
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ success: false, error: updateError?.message || "Failed to activate" }, { status: 500 });
    }

    try {
      await writeAuditLog({
        companyId,
        actor: (user as any)?.email ?? (user as any)?.id ?? "unknown",
        action: "seat_activated",
        status: "success",
        metadata: { seat_id: seatId },
      });
    } catch {
      // ignore audit failures
    }

    return NextResponse.json({ success: true, seat: updated, message: "User ID activated" });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
