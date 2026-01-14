import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return NextResponse.json(
    { success: false, error: 'Wallet/top-up has been removed. Use Razorpay.' },
    { status: 410 }
  );
}

