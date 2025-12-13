import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
  try {
    const { handset_id } = await req.json();

    if (!handset_id) {
      return NextResponse.json({ error: "handset_id required" }, { status: 400 });
    }

    const existing = await prisma.company_handsets.findFirst({ where: { handset_id } });
    if (!existing) {
      return NextResponse.json({ error: "Handset not found" }, { status: 404 });
    }

    const handset = await prisma.company_handsets.update({
      where: { id: existing.id },
      data: {
        active: false,
        deactivated_at: new Date(),
      },
    });

    return NextResponse.json({ success: true, handset });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
