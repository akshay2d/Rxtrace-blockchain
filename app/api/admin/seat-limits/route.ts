import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PRICING, type PlanType } from "@/lib/billingConfig";
import { normalizePlanType } from "@/lib/billing/period";
import { supabaseServer } from "@/lib/supabase/server";

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
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");

    if (!companyId) {
      return NextResponse.json({ error: "company_id required" }, { status: 400 });
    }

    const {
      data: { user },
      error: authErr,
    } = await supabaseServer().auth.getUser();

    if (!user || authErr) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    const { data: companyRow } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .maybeSingle();

    if (!companyRow) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (String((companyRow as any)?.user_id ?? "") !== String(user.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Backfill: ensure the owner has an ACTIVE seat.
    // Starter plan includes 1 seat and the owner should consume it.
    try {
      const { data: ownerSeat, error: ownerCheckErr } = await supabase
        .from("seats")
        .select("id")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (ownerCheckErr) {
        console.error('Owner seat check error:', ownerCheckErr);
      }

      if (!ownerSeat && !ownerCheckErr) {
        const now = new Date().toISOString();
        const { error: insertErr } = await supabase.from("seats").insert({
          company_id: companyId,
          user_id: user.id,
          email: (user.email ?? null) as any,
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
    console.log('Plan type resolved:', planType);
    
    const baseMax = planType ? PRICING.plans[planType].max_seats : 1;
    console.log('Base max seats:', baseMax);
    
    const extra = Number((companyRow as any)?.extra_user_seats ?? 0);
    const maxSeats = baseMax + (Number.isFinite(extra) ? extra : 0);
    console.log('Max seats (base + extra):', maxSeats, '=', baseMax, '+', extra);

    // Seats used = active + pending (pending invites also consume a slot)
    console.log('Querying seats for company:', companyId);
    const { count: usedSeats, error: countError } = await supabase
      .from("seats")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", ["active", "pending"]);

    console.log('Seats count result:', { usedSeats, countError });

    if (countError) {
      console.error('Count error details:', JSON.stringify(countError, null, 2));
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
