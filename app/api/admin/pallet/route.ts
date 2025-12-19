import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const company_id = url.searchParams.get("company_id");
    if (!company_id) return NextResponse.json({ success: false, error: "company_id is required" }, { status: 400 });

    const pallets = await prisma.pallets.findMany({
      where: { company_id },
      orderBy: { created_at: "desc" },
      include: {
        cartons: true
      },
      take: 100
    });

    return NextResponse.json({ success: true, pallets });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
