import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const company_id = url.searchParams.get("company_id");
    if (!company_id) return NextResponse.json({ success: false, error: "company_id is required" }, { status: 400 });

    const handsets = await prisma.company_handsets.findMany({
      where: { company_id },
      orderBy: { activated_at: "desc" },
    });

    return NextResponse.json({ success: true, handsets });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
