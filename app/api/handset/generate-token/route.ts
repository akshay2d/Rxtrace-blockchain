import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
  try {
    const { company_id } = await req.json();
    if (!company_id) return NextResponse.json({ success: false, error: "company_id required" });

    // Respect activation_enabled master switch
    const settingsRow = await prisma.company_active_heads.findUnique({
      where: { company_id },
      select: { heads: true },
    });
    const heads = (settingsRow?.heads as any) ?? {};
    const activationEnabled =
      heads?.scanner_activation_enabled === undefined ? true : !!heads.scanner_activation_enabled;
    if (!activationEnabled) {
      return NextResponse.json(
        { success: false, error: 'Activation disabled by admin' },
        { status: 403 }
      );
    }

    // Generate simple 8-digit token: RX-NNNNNN (6 random digits)
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    const token = `RX-${randomDigits}`;

    // Store token in table handset_tokens
    await prisma.handset_tokens.create({
      data: {
        company_id,
        token,
        used: false
      }
    });

    return NextResponse.json({ success: true, token });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
