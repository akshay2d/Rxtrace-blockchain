import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
  try {
    const { device_fingerprint, company_id } = await req.json();

    if (!device_fingerprint || !company_id)
      return NextResponse.json({ success: false, error: "device_fingerprint & company_id required" });

    const handset = await prisma.handsets.create({
      data: {
        company_id,
        device_fingerprint,
        high_scan_enabled: false,
        status: "ACTIVE"
      }
    });

    const token = jwt.sign(
      {
        handset_id: handset.id,
        company_id,
        role: "UNIT_ONLY"
      },
      process.env.JWT_SECRET!,
      { expiresIn: "180d" }
    );

    return NextResponse.json({ success: true, token });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
