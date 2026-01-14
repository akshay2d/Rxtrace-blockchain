import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return NextResponse.json(
    { success: false, error: 'Wallet/credits are removed. Use Razorpay.' },
    { status: 410 }
  );
}
