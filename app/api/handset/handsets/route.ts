export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireUserSession } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  try {
    const auth = await requireUserSession();
    if ("error" in auth) return auth.error;
    const supabase = await supabaseServer();

    const { data: handsets, error } = await supabase
      .from("handset")
      .select("id, devicename, activatedat, active, tokenid, token:token(*)")
      .eq("userid", auth.userId)
      .order("activatedat", { ascending: false });
    if (error) {
      throw new Error(error.message);
    }

    const normalized = (handsets ?? []).map((row: any) => ({
      id: row.id,
      deviceName: row.devicename,
      tokenId: row.tokenid,
      activatedAt: row.activatedat,
      active: row.active,
      token: row.token
        ? {
            ...row.token,
            userId: row.token.userid,
            tokenNumber: row.token.tokennumber,
            generatedAt: row.token.generatedat,
            activationCount: row.token.activationcount,
            maxActivations: row.token.maxactivations,
          }
        : null,
    }));

    return NextResponse.json({ handsets: normalized });
  } catch (err: any) {
    console.error("Fetch handsets error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load handsets" },
      { status: 500 }
    );
  }
}
