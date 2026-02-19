export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireUserSession } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";

const DEFAULT_PAGE_SIZE = 10;

export async function GET(req: Request) {
  try {
    const auth = await requireUserSession();
    if ("error" in auth) return auth.error;
    const supabase = await supabaseServer();

    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
    const limit = Math.min(25, Math.max(1, Number(url.searchParams.get("limit") || String(DEFAULT_PAGE_SIZE))));
    const skip = (page - 1) * limit;

    const [{ data: tokens, error: tokensError }, { count: total, error: totalError }] =
      await Promise.all([
        supabase
          .from("token")
          .select("*")
          .eq("userid", auth.userId)
          .order("generatedat", { ascending: false })
          .range(skip, skip + limit - 1),
        supabase
          .from("token")
          .select("*", { count: "exact", head: true })
          .eq("userid", auth.userId),
      ]);

    if (tokensError) {
      throw new Error(tokensError.message);
    }
    if (totalError) {
      throw new Error(totalError.message);
    }

    return NextResponse.json({
      tokens: tokens ?? [],
      total: total ?? 0,
      page,
      limit,
      hasMore: skip + (tokens?.length ?? 0) < (total ?? 0),
    });
  } catch (err: any) {
    console.error("List tokens error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to list tokens" },
      { status: 500 }
    );
  }
}
