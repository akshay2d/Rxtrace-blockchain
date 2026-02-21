import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { PRICING, type PlanType } from "@/lib/billingConfig";
import { normalizePlanType } from "@/lib/billing/period";
import { resolveCompanyIdFromRequest } from "@/lib/company/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function resolveCompanyPlanType(supabase: ReturnType<typeof getSupabaseAdmin>, companyId: string): Promise<PlanType | null> {
  const { data: companyRow } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .maybeSingle();

  const planRaw =
    // Prefer subscription_plan (source of truth for billing) over legacy columns.
    (companyRow as any)?.subscription_plan ??
    (companyRow as any)?.plan_type ??
    (companyRow as any)?.plan ??
    (companyRow as any)?.tier;

  return normalizePlanType(planRaw);
}

export async function GET(req: Request) {
  try {
    const { error: adminError } = await requireAdmin();
    if (adminError) return adminError;

    const companyIdFromAuth = await resolveCompanyIdFromRequest(req);
    if (!companyIdFromAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const requestedCompanyId = searchParams.get("company_id");
    if (requestedCompanyId && requestedCompanyId !== companyIdFromAuth) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const companyId = companyIdFromAuth;

    const supabase = getSupabaseAdmin();

    const { data: companyRow } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .maybeSingle();

    if (!companyRow) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Backfill: ensure the owner has an ACTIVE seat.
    // Starter plan includes 1 seat and the owner should consume it.
    try {
      const { data: ownerSeat, error: ownerCheckErr } = await supabase
        .from("seats")
        .select("id")
        .eq("company_id", companyId)
        .eq("user_id", (companyRow as any)?.user_id)
        .maybeSingle();

      if (ownerCheckErr) {
        console.error('Owner seat check error:', ownerCheckErr);
      }

      if (!ownerSeat && !ownerCheckErr) {
        const now = new Date().toISOString();
        const { error: insertErr } = await supabase.from("seats").insert({
          company_id: companyId,
          user_id: (companyRow as any)?.user_id,
          email: (companyRow as any)?.email ?? null,
          role: "admin",
          active: true,
          status: "active",
          invited_at: now,
          activated_at: now,
          created_at: now,
        });
        
        if (insertErr) {
          console.error('Owner seat insert error:', insertErr);
        }
      }
    } catch (backfillErr: any) {
      console.error('Owner seat backfill exception:', backfillErr);
      // ignore; limits still computed below
    }

    const planType = await resolveCompanyPlanType(supabase, companyId);
    
    const baseMax = planType ? PRICING.plans[planType].max_seats : 1;
    
    const extra = Number((companyRow as any)?.extra_user_seats ?? 0);
    const maxSeats = baseMax + (Number.isFinite(extra) ? extra : 0);

    // Seats used = active + pending (pending invites also consume a slot)
    const { count: usedSeats, error: countError } = await supabase
      .from("seats")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", ["active", "pending"]);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    const used = usedSeats ?? 0;
    const available = Math.max(0, maxSeats - used);

    return NextResponse.json(
      {
        plan: planType ?? "starter",
        max_seats: maxSeats,
        used_seats: used,
        available_seats: available,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err: any) {
    console.error('Seat limits error:', err);
    return NextResponse.json({ error: err.message || String(err) || "Failed" }, { status: 500 });
  }
}
