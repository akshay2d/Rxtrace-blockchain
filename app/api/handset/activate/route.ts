export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/app/lib/prisma";
import { requireUserSession } from "@/lib/auth/session";

export async function POST(req: Request) {
  try {
    const auth = await requireUserSession();
    if ("error" in auth) return auth.error;

    const payload = (await req.json().catch(() => ({}))) as {
      tokenNumber?: string;
      deviceName?: string;
    };
    const { tokenNumber, deviceName } = payload;

    if (!tokenNumber || !deviceName) {
      return NextResponse.json(
        { success: false, error: "tokenNumber and deviceName required" },
        { status: 400 }
      );
    }

    const now = new Date();
    const userId = auth.userId;

    const result = await prisma.$transaction(async (tx) => {
      const tokenRecord = await tx.token.findFirst({
        where: {
          tokenNumber,
          userId,
        },
      });

      if (!tokenRecord) {
        throw new Error("Invalid activation token");
      }

      if (tokenRecord.status !== "ACTIVE") {
        throw new Error("Token is not active");
      }

      if (tokenRecord.expiry <= now) {
        throw new Error("Token has expired");
      }

      if (tokenRecord.activationCount >= tokenRecord.maxActivations) {
        throw new Error("Token activation limit reached");
      }

      const handset = await tx.handset.create({
        data: {
          userId,
          deviceName,
          tokenId: tokenRecord.id,
          activatedAt: now,
          active: true,
        },
      });

      await tx.token.update({
        where: { id: tokenRecord.id },
        data: {
          activationCount: { increment: 1 },
        },
      });

      return { handset, token: tokenRecord };
    });

    const jwtToken = jwt.sign(
      {
        handset_id: result.handset.id,
        user_id: userId,
        role: "HIGH_SCAN",
      },
      process.env.JWT_SECRET!,
      { expiresIn: "180d" }
    );

    return NextResponse.json({
      success: true,
      jwt: jwtToken,
      token: result.token.tokenNumber,
      handset_id: result.handset.id,
      activated_at: result.handset.activatedAt.toISOString(),
    });
  } catch (err: any) {
    console.error("Handset activation error:", err);

    return NextResponse.json(
      { success: false, error: err?.message || "Activation failed" },
      { status: 400 }
    );
  }
}
