export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUserSession } from "@/lib/auth/session";

export async function POST(req: Request) {
  try {
    const auth = await requireUserSession();
    if ("error" in auth) return auth.error;

    const payload = (await req.json().catch(() => ({}))) as { tokenNumber?: string };
    if (!payload.tokenNumber) {
      return NextResponse.json(
        { success: false, error: "tokenNumber required" },
        { status: 400 }
      );
    }

    const tokenRecord = await prisma.token.findFirst({
      where: {
        tokenNumber: payload.tokenNumber,
        userId: auth.userId,
      },
    });

    if (!tokenRecord) {
      return NextResponse.json(
        { success: false, error: "Token not found" },
        { status: 404 }
      );
    }

    if (tokenRecord.status === "DISABLED") {
      return NextResponse.json({ success: true, message: "Token already disabled" });
    }

    await prisma.token.update({
      where: { id: tokenRecord.id },
      data: { status: "DISABLED" },
    });

    return NextResponse.json({ success: true, token: tokenRecord.tokenNumber });
  } catch (err: any) {
    console.error("Disable token error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to disable token" },
      { status: 500 }
    );
  }
}
