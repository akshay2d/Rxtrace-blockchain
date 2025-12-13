// app/api/admin/scan-history/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
    const company_id = url.searchParams.get("company_id") ?? undefined;

    const where: any = { type: "scan" };
    if (company_id) where.company_id = company_id;

    const rows = await prisma.billing_transactions.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: limit,
    });

    return NextResponse.json({ success: true, events: rows });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
