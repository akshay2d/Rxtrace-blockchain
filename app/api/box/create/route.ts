import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
  const { sscc, company_id, carton_sscc } = await req.json();
  const box = await prisma.box.create({
    data: { sscc, company_id, carton_id: carton_sscc }
  });
  return NextResponse.json({ success: true, box });
}
