import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { company_id, amount } = body;

    if (!company_id)
      return NextResponse.json({ success: false, error: "company_id is required" }, { status: 400 });

    if (!amount || Number(amount) <= 0)
      return NextResponse.json({ success: false, error: "Invalid top-up amount" }, { status: 400 });

    const amt = Number(amount);

    // Use Supabase RPC function for atomic operation
    const { data, error } = await supabase.rpc("wallet_update_and_record", {
      p_company_id: company_id,
      p_op: "TOPUP",
      p_amount: amt,
      p_reference: "manual_topup",
      p_created_by: null,
    });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const result = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({
      success: true,
      message: "Top-up successful",
      company_id,
      balance: result?.balance_after || 0,
      txId: result?.id,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) }, { status: 500 });
  }
}

