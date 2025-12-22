import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

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

    return NextResponse.json({ seats: seats || [] });
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

    const rows = await prisma.$transaction(
      Array.from({ length: count }).map(() =>
        prisma.seats.create({ data: { company_id: companyId, active: true } })
      )
    );

    return NextResponse.json({ created: rows.length });
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

    // Verify seat belongs to this company
    const seat = await prisma.seats.findFirst({
      where: {
        id: seatId,
        company_id: companyIdFromAuth,
      },
    });

    if (!seat) {
      return NextResponse.json({ error: "Seat not found" }, { status: 404 });
    }

    // Check if seat has active handsets
    const activeHandsets = await prisma.handsets.count({
      where: {
        seat_id: seatId,
        status: "ACTIVE",
      },
    });

    if (activeHandsets > 0) {
      return NextResponse.json(
        { error: "Cannot deactivate seat with active handsets" },
        { status: 400 }
      );
    }

    // Deactivate the seat
    const updated = await prisma.seats.update({
      where: { id: seatId },
      data: { active: false },
    });

    return NextResponse.json({ success: true, seat: updated });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed" },
      { status: 500 }
    );
  }
}
