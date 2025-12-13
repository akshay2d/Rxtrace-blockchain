import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
  try {
    const { token, device_fingerprint } = await req.json();
    if (!token || !device_fingerprint)
      return NextResponse.json({ success: false, error: "token and device_fingerprint required" });

    const record = await prisma.handset_tokens.findUnique({ where: { token } });
    if (!record) return NextResponse.json({ success: false, error: "Invalid activation token" });

    if (record.used) return NextResponse.json({ success: false, error: "Token already used" });

    // Mark token as used
    await prisma.handset_tokens.update({
      where: { token },
      data: { used: true }
    });

    // Register handset in database
    const handset = await prisma.handsets.create({
      data: {
        company_id: record.company_id,
        device_fingerprint,
        role: "HIGH_SCAN",
        status: "ACTIVE"
      }
    });

    // Issue JWT
    const jwtToken = jwt.sign(
      {
        handset_id: handset.id,
        company_id: handset.company_id,
        role: "HIGH_SCAN"
      },
      process.env.JWT_SECRET!,
      { expiresIn: "90d" }
    );

    return NextResponse.json({ success: true, token: jwtToken });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
