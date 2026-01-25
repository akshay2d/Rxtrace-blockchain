import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import Razorpay from "razorpay";

export const runtime = "nodejs";

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay not configured");
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// GET: List refunds
export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");

    let query = supabase
      .from("refunds")
      .select(`
        *,
        companies!inner(id, company_name)
      `)
      .order("created_at", { ascending: false });

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    const { data, error } = await query.limit(100);

    if (error) throw error;
    return NextResponse.json({ success: true, refunds: data || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: Initiate refund
export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const { company_id, razorpay_payment_id, amount, reason } = body;

    if (!company_id || !razorpay_payment_id || !amount || !reason) {
      return NextResponse.json(
        { success: false, error: "company_id, razorpay_payment_id, amount, and reason are required" },
        { status: 400 }
      );
    }

    // Create refund record
    const { data: refund, error: refundError } = await supabase
      .from("refunds")
      .insert({
        company_id,
        razorpay_payment_id,
        amount,
        reason,
        status: "PENDING",
      })
      .select()
      .single();

    if (refundError) throw refundError;

    // Initiate Razorpay refund
    try {
      const razorpay = getRazorpay();
      const razorpayRefund = await razorpay.payments.refund(razorpay_payment_id, {
        amount: Math.round(amount * 100), // Convert to paise
        notes: { reason },
      });

      // Update refund record
      await supabase
        .from("refunds")
        .update({
          razorpay_refund_id: razorpayRefund.id,
          status: razorpayRefund.status === "processed" ? "SUCCESS" : "PROCESSING",
        })
        .eq("id", refund.id);
    } catch (razorpayErr: any) {
      // Update status to failed
      await supabase
        .from("refunds")
        .update({ status: "FAILED" })
        .eq("id", refund.id);

      return NextResponse.json(
        { success: false, error: `Razorpay refund failed: ${razorpayErr.message}` },
        { status: 500 }
      );
    }

    // Get updated refund
    const { data: updatedRefund } = await supabase
      .from("refunds")
      .select("*")
      .eq("id", refund.id)
      .single();

    // Log audit
    await supabase.from("audit_logs").insert({
      action: "REFUND_INITIATED",
      company_id,
      new_value: { refund_id: refund.id, amount, reason, razorpay_payment_id },
    });

    return NextResponse.json({ success: true, refund: updatedRefund });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
