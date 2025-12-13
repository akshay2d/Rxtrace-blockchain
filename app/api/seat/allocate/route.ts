import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { company_id, seat_id } = body;

    if (!company_id) return NextResponse.json({ success: false, error: "company_id required" }, { status: 400 });
    if (!seat_id) return NextResponse.json({ success: false, error: "seat_id required" }, { status: 400 });

    // Check if seat already exists
    const existing = await prisma.company_seats.findFirst({
      where: { seat_id, company_id }
    });

    let seat;
    if (existing) {
      seat = await prisma.company_seats.update({
        where: { id: existing.id },
        data: {
          active: true,
          deactivated_at: null,
        },
      });
    } else {
      seat = await prisma.company_seats.create({
        data: {
          seat_id,
          company_id,
          active: true,
          monthly_fee: 200,
        },
      });
    }

    return NextResponse.json({ success: true, message: "Seat allocated", seat });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
