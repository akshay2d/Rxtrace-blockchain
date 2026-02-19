export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireUserSession } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";

const MAX_TOKENS_PER_USER = 10;
const TOKEN_ATTEMPTS = 5;

function buildTokenNumber() {
  const randomDigits = crypto.randomInt(0, 1000000);
  return `RX-${randomDigits.toString().padStart(6, "0")}`;
}

export async function POST(req: Request) {
  try {
    const auth = await requireUserSession();
    if ("error" in auth) return auth.error;
    const supabase = await supabaseServer();

    const userId = auth.userId;
    const { count: activeTokens, error: activeTokensError } = await supabase
      .from("token")
      .select("*", { count: "exact", head: true })
      .eq("userid", userId)
      .eq("status", "ACTIVE");
    if (activeTokensError) {
      throw new Error(activeTokensError.message);
    }

    if ((activeTokens ?? 0) >= MAX_TOKENS_PER_USER) {
      return NextResponse.json(
        { success: false, error: `Maximum of ${MAX_TOKENS_PER_USER} active tokens reached` },
        { status: 400 }
      );
    }

    const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    for (let attempt = 0; attempt < TOKEN_ATTEMPTS; attempt++) {
      const tokenNumber = buildTokenNumber();
      try {
        const { data: token, error: insertError } = await supabase
          .from("token")
          .insert({
            userid: userId,
            tokennumber: tokenNumber,
            expiry: expiry.toISOString(),
          })
          .select("*")
          .single();
        if (insertError) {
          throw insertError;
        }

        return NextResponse.json({
          success: true,
          token: token.tokennumber,
          generatedAt: new Date(token.generatedat).toISOString(),
          expiry: new Date(token.expiry).toISOString(),
          status: token.status,
          activationCount: token.activationcount,
          maxActivations: token.maxactivations,
        });
      } catch (err: any) {
        if (err?.code === "23505") {
          continue;
        }
        throw err;
      }
    }

    return NextResponse.json(
      { success: false, error: "Failed to generate a unique token, please retry" },
      { status: 500 }
    );
  } catch (error: any) {
    console.error("Generate token error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate token" },
      { status: 500 }
    );
  }
}
