export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUserSession } from "@/lib/auth/session";

const DEFAULT_PAGE_SIZE = 10;

export async function GET(req: Request) {
  try {
    const auth = await requireUserSession();
    if ("error" in auth) return auth.error;

    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
    const limit = Math.min(25, Math.max(1, Number(url.searchParams.get("limit") || String(DEFAULT_PAGE_SIZE))));
    const skip = (page - 1) * limit;

    const [tokens, total] = await Promise.all([
      prisma.token.findMany({
        where: { userId: auth.userId },
        orderBy: { generatedAt: "desc" },
        take: limit,
        skip,
      }),
      prisma.token.count({ where: { userId: auth.userId } }),
    ]);

    return NextResponse.json({
      tokens,
      total,
      page,
      limit,
      hasMore: skip + tokens.length < total,
    });
  } catch (err: any) {
    console.error("List tokens error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to list tokens" },
      { status: 500 }
    );
  }
}
