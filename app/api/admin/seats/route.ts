import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
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

  const company = await prisma.companies.findFirst({
    where: { user_id: user.id },
    select: { id: true },
  });

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

    const seats = await prisma.seats.findMany({
      where: { company_id: companyId },
      orderBy: { created_at: "asc" },
    });

    return NextResponse.json({ seats });
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
