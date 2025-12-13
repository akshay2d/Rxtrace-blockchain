import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { company_id, seat_id } = body;

    if (!company_id) return NextResponse.json({ success: false, error: "company_id required" }, { status: 400 });
    if (!seat_id) return NextResponse.json({ success: false, error: "seat_id required" }, { status: 400 });

    const seat = await prisma.company_seats.upsert({
      where: { seat_id },
      create: {
        seat_id,
        company_id,
        active: true,
        monthly_fee: 200,
      },
      update: {
        active: true,
        deactivated_at: null,
      },
    });

    return NextResponse.json({ success: true, message: "Seat allocated", seat });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}
