import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
  try {
    const payload = (await req.json().catch(() => ({}))) as {
      token?: string;
      device_fingerprint?: string;
    };
    const { token, device_fingerprint } = payload;

    if (!token || !device_fingerprint) {
      return NextResponse.json(
        { success: false, error: "token and device_fingerprint required" },
        { status: 400 }
      );
    }

    const tokenRecord = await prisma.handset_tokens.findUnique({
      where: { token },
    });

    if (!tokenRecord) {
      return NextResponse.json(
        { success: false, error: "Invalid activation token" },
        { status: 400 }
      );
    }

    if (tokenRecord.disabled) {
      return NextResponse.json(
        { success: false, error: "Token has been disabled" },
        { status: 400 }
      );
    }

    if (tokenRecord.used) {
      return NextResponse.json(
        { success: false, error: "Token already redeemed" },
        { status: 400 }
      );
    }

    if (!tokenRecord.high_scan) {
      return NextResponse.json(
        { success: false, error: "Token not authorized for high scan" },
        { status: 400 }
      );
    }

    const settingsRow = await prisma.company_active_heads.findUnique({
      where: { company_id: tokenRecord.company_id },
      select: { heads: true },
    });
    const heads = (settingsRow?.heads as any) ?? {};
    const activationEnabled =
      heads?.scanner_activation_enabled === undefined ? true : Boolean(heads.scanner_activation_enabled);

    if (!activationEnabled) {
      return NextResponse.json(
        { success: false, error: "Activation disabled by admin" },
        { status: 403 }
      );
    }

    const now = new Date();
    let handset = await prisma.handsets.findUnique({
      where: { device_fingerprint },
    });

    if (handset && handset.company_id !== tokenRecord.company_id) {
      return NextResponse.json(
        { success: false, error: "Device fingerprint already claimed by another company" },
        { status: 403 }
      );
    }

    if (handset) {
      handset = await prisma.handsets.update({
        where: { id: handset.id },
        data: {
          company_id: tokenRecord.company_id,
          high_scan_enabled: true,
          status: "ACTIVE",
          activated_at: now,
        },
      });
    } else {
      handset = await prisma.handsets.create({
        data: {
          company_id: tokenRecord.company_id,
          device_fingerprint,
          high_scan_enabled: true,
          status: "ACTIVE",
          activated_at: now,
        },
      });
    }

    await prisma.handset_tokens.update({
      where: { token },
      data: {
        used: true,
        activated_at: now,
        activated_handset: handset.id,
      },
    });

    const jwtToken = jwt.sign(
      {
        handset_id: handset.id,
        company_id: handset.company_id,
        role: "HIGH_SCAN",
      },
      process.env.JWT_SECRET!,
      { expiresIn: "180d" }
    );

    return NextResponse.json({
      success: true,
      jwt: jwtToken,
      high_scan: true,
    });
  } catch (err: any) {
    console.error("Handset activation error:", err);

    return NextResponse.json(
      { success: false, error: err?.message || "Activation failed" },
      { status: 500 }
    );
  }
}
