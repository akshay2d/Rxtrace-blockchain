import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PRICING, type PlanType } from "@/lib/billingConfig";
import { normalizePlanType } from "@/lib/billing/period";

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

async function resolveCompanyIdFromRequest(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  const supabase = getSupabaseAdmin();
  const accessToken = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) return null;

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', user.id)
    .single();

  return company?.id ?? null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const companyIdFromAuth = await resolveCompanyIdFromRequest(req);
    const companyId = companyIdFromAuth ?? searchParams.get("company_id");

    if (!companyId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: companyIdFromAuth === null ? 401 : 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: seats } = await supabase
      .from('seats')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true });

    return NextResponse.json({ seats: seats || [] }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const companyIdFromAuth = await resolveCompanyIdFromRequest(req);
    const companyId = companyIdFromAuth ?? body.company_id;
    if (!companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawCount = body.count ?? 1;
    const count = Number(rawCount);
    if (!Number.isFinite(count) || !Number.isInteger(count) || count <= 0) {
      return NextResponse.json({ error: "count must be a positive integer" }, { status: 400 });
    }

    const MAX_CREATE = 1000;
    if (count > MAX_CREATE) {
      return NextResponse.json(
        { error: `count cannot exceed ${MAX_CREATE}` },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Enforce seat/user-id limits STRICTLY (unless bypass_limit flag for paid seats)
    const bypassLimit = body.bypass_limit === true;
    
    const { data: companyRow } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .maybeSingle();

    const planType = await resolveCompanyPlanType(supabase, companyId);
    const baseMax = planType ? PRICING.plans[planType].max_seats : 1; // Default to starter (1 seat) if no plan
    const extra = Number((companyRow as any)?.extra_user_seats ?? 0);
    const maxSeats = baseMax + (Number.isFinite(extra) ? extra : 0);
    
    if (!bypassLimit) {
      const { count: usedSeats, error: countError } = await supabase
        .from('seats')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .in('status', ['active', 'pending']);

      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 });
      }

      const nextTotal = (usedSeats ?? 0) + count;
      if (nextTotal > maxSeats) {
        return NextResponse.json(
          {
            error: `Seat limit reached. Current plan allows ${maxSeats} User ID(s). You have ${usedSeats ?? 0} used (active/pending). Purchase additional User IDs at ₹3,000/month each.`,
            plan: planType || "starter",
            max_seats: maxSeats,
            active_seats: usedSeats ?? 0,
            requested: count,
            requires_payment: true
          },
          { status: 403 }
        );
      }
    }

    const now = new Date().toISOString();
    const seatsToCreate = Array.from({ length: count }).map(() => ({
      company_id: companyId,
      active: true,
      status: 'active',
      activated_at: now,
    }));

    const { data: rows, error } = await supabase
      .from('seats')
      .insert(seatsToCreate)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ created: rows?.length || 0 }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const seatId = searchParams.get("seat_id");

    if (!seatId) {
      return NextResponse.json({ error: "seat_id required" }, { status: 400 });
    }

    const companyIdFromAuth = await resolveCompanyIdFromRequest(req);
    if (!companyIdFromAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    // Verify seat belongs to this company
    const { data: seat } = await supabase
      .from('seats')
      .select('*')
      .eq('id', seatId)
      .eq('company_id', companyIdFromAuth)
      .single();

    if (!seat) {
      return NextResponse.json({ error: "Seat not found" }, { status: 404 });
    }

    // Check if seat has active handsets
    const { count: activeHandsets } = await supabase
      .from('handsets')
      .select('*', { count: 'exact', head: true })
      .eq('seat_id', seatId)
      .eq('status', 'ACTIVE');

    if (activeHandsets && activeHandsets > 0) {
      return NextResponse.json(
        { error: "Cannot deactivate seat with active handsets" },
        { status: 400 }
      );
    }

    // Deactivate the seat
    const { data: updated, error } = await supabase
      .from('seats')
      .update({ active: false })
      .eq('id', seatId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, seat: updated }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed" },
      { status: 500 }
    );
  }
}
