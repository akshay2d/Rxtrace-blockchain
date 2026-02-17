export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUserSession } from "@/lib/auth/session";

export async function POST(req: Request) {
  try {
    const auth = await requireUserSession();
    if ("error" in auth) return auth.error;

    const { handset_id } = await req.json();
    if (!handset_id) {
      return NextResponse.json({ success: false, error: "handset_id required" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const handset = await tx.handset.findUnique({
        where: { id: handset_id },
        include: { token: true },
      });

      if (!handset || handset.userId !== auth.userId) {
        throw new Error("Handset not found");
      }

      if (!handset.active) {
        return { handset, adjustedTokenCount: handset.token.activationCount };
      }

      const newCount = Math.max(0, handset.token.activationCount - 1);

      await tx.token.update({
        where: { id: handset.tokenId },
        data: { activationCount: newCount },
      });

      const updatedHandset = await tx.handset.update({
        where: { id: handset.id },
        data: { active: false },
      });

      return { handset: updatedHandset, adjustedTokenCount: newCount };
    });

    return NextResponse.json({
      success: true,
      handset: result.handset,
      activationCount: result.adjustedTokenCount,
    });
  } catch (err: any) {
    console.error("Deactivate handset error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to deactivate handset" },
      { status: 400 }
    );
  }
}
