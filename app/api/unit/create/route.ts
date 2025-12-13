import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
  const { uid, company_id, box_sscc } = await req.json();
  const unit = await prisma.unit.create({
    data: { uid, company_id, box_id: box_sscc }
  });
  return NextResponse.json({ success: true, unit });
}
