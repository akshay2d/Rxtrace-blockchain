import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
  try {
    const { token, device_fingerprint } = await req.json();

    if (!token || !device_fingerprint) {
      return NextResponse.json(
        { success: false, error: "token and device_fingerprint required" },
        { status: 400 }
      );
    }

    /* 1️⃣ Validate activation token */
    const tokenRecord = await prisma.handset_tokens.findUnique({
      where: { token }
    });

    if (!tokenRecord) {
      return NextResponse.json(
        { success: false, error: "Invalid activation token" },
        { status: 400 }
      );
    }

    if (tokenRecord.used) {
      return NextResponse.json(
        { success: false, error: "Token already used" },
        { status: 400 }
      );
    }

    /* 2️⃣ Check for duplicate device fingerprint */
    const existing = await prisma.handsets.findUnique({
      where: { device_fingerprint }
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "Device already registered" },
        { status: 400 }
      );
    }

    /* 3️⃣ Register handset (no seat required) */
    const handset = await prisma.handsets.create({
      data: {
        company_id: tokenRecord.company_id,
        device_fingerprint,
        high_scan_enabled: tokenRecord.high_scan,
        status: "ACTIVE"
      }
    });

    /* 4️⃣ Mark token as used ONLY after successful handset creation */
    await prisma.handset_tokens.update({
      where: { token },
      data: { used: true }
    });

    /* 5️⃣ Issue JWT for scanner app */
    const jwtToken = jwt.sign(
      {
        handset_id: handset.id,
        company_id: handset.company_id,
        high_scan: handset.high_scan_enabled
      },
      process.env.JWT_SECRET!,
      { expiresIn: "90d" }
    );

    return NextResponse.json({
      success: true,
      jwt: jwtToken,
      high_scan: handset.high_scan_enabled
    });
  } catch (err: any) {
    console.error("Handset activation error:", err);

    return NextResponse.json(
      { success: false, error: err.message || "Activation failed" },
      { status: 500 }
    );
  }
}
