import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const company_id = searchParams.get("company_id");

    if (!company_id) {
      return NextResponse.json({ error: "company_id required" }, { status: 400 });
    }

    const tokens = await prisma.handset_tokens.findMany({
      where: { company_id },
      orderBy: { created_at: "desc" },
      take: 20,
    });

    return NextResponse.json({ tokens });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
