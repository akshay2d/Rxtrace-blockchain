import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { calculateTotalUsage } from "@/lib/billingConfig";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return NextResponse.json(
    { error: 'Wallet has been removed. Use Razorpay subscription/add-ons.' },
    { status: 410 }
  );
}
