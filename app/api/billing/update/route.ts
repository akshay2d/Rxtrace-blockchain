import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { company_id, op, amount, reference = null, created_by = null } = body;
    if (!company_id || !op || !amount) return NextResponse.json({ error: "company_id, op, amount required" }, { status: 400 });

    const { data, error } = await supabase.rpc("wallet_update_and_record", {
      p_company_id: company_id,
      p_op: op,
      p_amount: amount,
      p_reference: reference,
      p_created_by: created_by,
    });

    if (error) return NextResponse.json({ error }, { status: 400 });

    // rpc returns array of rows; take first
    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ success: true, result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
