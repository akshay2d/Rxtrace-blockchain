export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUserSession } from "@/lib/auth/session";

export async function GET(req: Request) {
  try {
    const auth = await requireUserSession();
    if ("error" in auth) return auth.error;

    const handsets = await prisma.handset.findMany({
      where: { userId: auth.userId },
      include: { token: true },
      orderBy: { activatedAt: "desc" },
    });

    return NextResponse.json({ handsets });
  } catch (err: any) {
    console.error("Fetch handsets error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load handsets" },
      { status: 500 }
    );
  }
}
