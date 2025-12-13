import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
  const { sscc, company_id } = await req.json();
  const pallet = await prisma.pallet.create({ data: { sscc, company_id }});
  return NextResponse.json({ success: true, pallet });
}
