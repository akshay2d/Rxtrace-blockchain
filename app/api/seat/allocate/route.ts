import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PRICING, type PlanType } from "@/lib/billingConfig";

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

  const planRaw = (companyRow as any)?.plan ?? (companyRow as any)?.plan_type ?? (companyRow as any)?.subscription_plan ?? (companyRow as any)?.tier;
  return normalizePlanType(planRaw);
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { company_id } = body;

    if (!company_id) return NextResponse.json({ success: false, error: "company_id required" }, { status: 400 });

    // Enforce seat/user-id limits when company plan is available.
    const planType = await resolveCompanyPlanType(supabase, company_id);
    if (planType) {
      const maxSeats = PRICING.plans[planType].max_seats;
      const { count: activeSeats, error: countError } = await supabase
        .from("seats")
        .select("*", { count: "exact", head: true })
        .eq("company_id", company_id)
        .eq("active", true);

      if (countError) {
        return NextResponse.json({ success: false, error: countError.message }, { status: 500 });
      }

      if ((activeSeats ?? 0) >= maxSeats) {
        return NextResponse.json(
          {
            success: false,
            error: `Seat limit reached for plan ${planType}. Upgrade plan to add more User IDs.`,
            plan: planType,
            max_seats: maxSeats,
            active_seats: activeSeats ?? 0,
          },
          { status: 403 }
        );
      }
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
