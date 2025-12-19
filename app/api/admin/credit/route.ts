import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { company_id, amount, type, notes } = await req.json();

    if (!company_id || !amount) {
      return NextResponse.json(
        { error: "company_id and amount are required" },
        { status: 400 }
      );
    }

    // Get current wallet
    const { data: wallet, error: walletError } = await supabase
      .from("company_wallets")
      .select("balance")
      .eq("company_id", company_id)
      .single();

    if (walletError && walletError.code !== "PGRST116") {
      return NextResponse.json({ error: walletError.message }, { status: 500 });
    }

    const currentBalance = wallet?.balance || 0;
    const newBalance = currentBalance + Number(amount);

    // Upsert wallet
    const { error: updateError } = await supabase
      .from("company_wallets")
      .upsert({
        company_id,
        balance: newBalance,
        status: newBalance > 0 ? "ACTIVE" : "FROZEN",
        updated_at: new Date().toISOString(),
      });

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Log transaction
    await supabase.from("billing_transactions").insert({
      company_id,
      type: type || "admin_adjustment",
      subtype: notes || "manual_credit",
      amount: Number(amount),
      balance_after: newBalance,
      count: 1,
    });

    return NextResponse.json({
      success: true,
      new_balance: newBalance,
      message: `Successfully added ${amount >= 0 ? "credit" : "debit"} of ₹${Math.abs(amount)}`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to add credit" },
      { status: 500 }
    );
  }
}
