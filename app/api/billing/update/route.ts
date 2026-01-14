import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Body:
 * {
 *   "company_id": "uuid",
 *   "op": "CHARGE" | "TOPUP",
 *   "amount": 123.45,
 *   "reference": "generation_job_xxx",
 *   "created_by": "user-uuid"
 * }
 */
export async function POST(req: Request) {
  return NextResponse.json(
    { error: 'Wallet has been removed. Use Razorpay subscription/add-ons.' },
    { status: 410 }
  );
}
