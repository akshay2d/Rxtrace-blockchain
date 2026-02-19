export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireUserSession } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const auth = await requireUserSession();
    if ("error" in auth) return auth.error;
    const supabase = await supabaseServer();

    const payload = (await req.json().catch(() => ({}))) as { tokenNumber?: string };
    if (!payload.tokenNumber) {
      return NextResponse.json(
        { success: false, error: "tokenNumber required" },
        { status: 400 }
      );
    }

    const { data: tokenRecord, error: tokenError } = await supabase
      .from("token")
      .select("*")
      .eq("tokennumber", payload.tokenNumber)
      .eq("userid", auth.userId)
      .maybeSingle();
    if (tokenError) {
      throw new Error(tokenError.message);
    }

    if (!tokenRecord) {
      return NextResponse.json(
        { success: false, error: "Token not found" },
        { status: 404 }
      );
    }

    if (tokenRecord.status === "DISABLED") {
      return NextResponse.json({ success: true, message: "Token already disabled" });
    }

    const { error: updateError } = await supabase
      .from("token")
      .update({ status: "DISABLED" })
      .eq("id", tokenRecord.id);
    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({ success: true, token: tokenRecord.tokennumber });
  } catch (err: any) {
    console.error("Disable token error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to disable token" },
      { status: 500 }
    );
  }
}
