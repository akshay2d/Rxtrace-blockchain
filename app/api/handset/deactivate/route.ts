export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireUserSession } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const auth = await requireUserSession();
    if ("error" in auth) return auth.error;
    const supabase = await supabaseServer();

    const { handset_id } = await req.json();
    if (!handset_id) {
      return NextResponse.json({ success: false, error: "handset_id required" }, { status: 400 });
    }

    const { data: handset, error: handsetError } = await supabase
      .from("handset")
      .select("id, userid, tokenid, active, token:token(*)")
      .eq("id", handset_id)
      .maybeSingle();
    if (handsetError) {
      throw new Error(handsetError.message);
    }
    if (!handset || handset.userid !== auth.userId) {
      throw new Error("Handset not found");
    }

    const tokenRow = handset.token as any;
    const currentCount = Number(tokenRow?.activationcount ?? 0);

    if (!handset.active) {
      return NextResponse.json({
        success: true,
        handset,
        activationCount: currentCount,
      });
    }

    const newCount = Math.max(0, currentCount - 1);

    const { error: tokenUpdateError } = await supabase
      .from("token")
      .update({ activationcount: newCount })
      .eq("id", handset.tokenid);
    if (tokenUpdateError) {
      throw new Error(tokenUpdateError.message);
    }

    const { data: updatedHandset, error: handsetUpdateError } = await supabase
      .from("handset")
      .update({ active: false })
      .eq("id", handset.id)
      .select("*")
      .single();
    if (handsetUpdateError) {
      throw new Error(handsetUpdateError.message);
    }

    return NextResponse.json({
      success: true,
      handset: updatedHandset,
      activationCount: newCount,
    });
  } catch (err: any) {
    console.error("Deactivate handset error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to deactivate handset" },
      { status: 400 }
    );
  }
}
