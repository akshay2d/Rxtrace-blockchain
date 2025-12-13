import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
  const { sscc, company_id, pallet_sscc } = await req.json();
  const carton = await prisma.carton.create({
    data: { sscc, company_id, pallet_id: pallet_sscc }
  });
  return NextResponse.json({ success: true, carton });
}
