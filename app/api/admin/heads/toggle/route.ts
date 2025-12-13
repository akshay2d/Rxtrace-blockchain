import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { company_id, head, enabled } = body;
    if (!company_id) return NextResponse.json({ success: false, error: "company_id is required" }, { status: 400 });
    if (!head) return NextResponse.json({ success: false, error: "head is required" }, { status: 400 });

    // fetch existing heads
    const existing = await prisma.company_active_heads.findUnique({ where: { company_id } });
    const currentHeads = (existing?.heads as Record<string, boolean>) ?? {};

    currentHeads[head] = !!enabled;

    const row = await prisma.company_active_heads.upsert({
      where: { company_id },
      create: { company_id, heads: currentHeads },
      update: { heads: currentHeads },
    });

    return NextResponse.json({ success: true, message: "Head updated", company_id, head, enabled: !!enabled, heads: row.heads });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
