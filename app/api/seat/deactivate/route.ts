import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { seat_id } = body;

    if (!seat_id) return NextResponse.json({ success: false, error: "seat_id required" }, { status: 400 });

    const existing = await prisma.company_seats.findFirst({ where: { seat_id } });
    if (!existing) return NextResponse.json({ success: false, error: "Seat not found" }, { status: 404 });

    const seat = await prisma.company_seats.update({
      where: { id: existing.id },
      data: {
        active: false,
        deactivated_at: new Date(),
      },
    });

    return NextResponse.json({ success: true, message: "Seat deactivated", seat });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
