import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = authHeader.replace("Bearer ", "");

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const company = await prisma.companies.findFirst({
      where: { user_id: user.id },
      select: { id: true }
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const activeHandsets = await prisma.handsets.count({
      where: {
        company_id: company.id,
        status: "ACTIVE"
      }
    });

    // Fetch detailed handset list
    const handsetsList = await prisma.handsets.findMany({
      where: {
        company_id: company.id
      },
      select: {
        id: true,
        device_fingerprint: true,
        status: true,
        high_scan_enabled: true,
        activated_at: true
      },
      orderBy: { activated_at: "desc" }
    });

    // Transform to match frontend expectations
    const handsets = handsetsList.map(h => ({
      id: h.id,
      handset_id: h.device_fingerprint,
      active: h.status === "ACTIVE",
      activated_at: h.activated_at?.toISOString() || null,
      deactivated_at: null,
      last_seen: h.activated_at?.toISOString() || null
    }));

    const activeToken = await prisma.handset_tokens.findFirst({
      where: {
        company_id: company.id,
        used: false
      },
      orderBy: { created_at: "desc" },
      select: { token: true }
    });

    return NextResponse.json({
      scanning_on: !!activeToken,
      active_handsets: activeHandsets,
      token: activeToken?.token || null,
      handsets: handsets
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed" },
      { status: 500 }
    );
  }
}
