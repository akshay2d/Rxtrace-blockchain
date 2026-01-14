import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function parsePurpose(purpose: string): { companyId: string; qty: number } | null {
  // Expected: addon_userid_company_<companyId>_qty_<qty>
  const match = purpose.match(/^addon_userid_company_(.+)_qty_(\d+)$/);
  if (!match) return null;
  const companyId = match[1];
  const qty = Number(match[2]);
  if (!companyId || !Number.isInteger(qty) || qty <= 0) return null;
  return { companyId, qty };
}

export async function POST(req: NextRequest) {
  try {
    const { payment_id, order_id, signature } = await req.json();

    if (!payment_id || !order_id) {
      return NextResponse.json({ error: "payment_id and order_id are required" }, { status: 400 });
    }

    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!razorpayKeySecret) {
      return NextResponse.json({ error: "Payment gateway not configured" }, { status: 500 });
    }

    if (signature) {
      const expectedSignature = crypto
        .createHmac("sha256", razorpayKeySecret)
        .update(`${order_id}|${payment_id}`)
        .digest("hex");

      if (expectedSignature !== signature) {
        return NextResponse.json({ error: "Invalid payment signature" }, { status: 401 });
      }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: orderRecord, error: orderError } = await supabase
      .from("razorpay_orders")
      .select("*")
      .eq("order_id", order_id)
      .maybeSingle();

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    if (!orderRecord) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const purpose = String(orderRecord.purpose ?? "");
    const parsed = parsePurpose(purpose);
    if (!parsed) {
      return NextResponse.json({ error: "This order is not a User ID add-on" }, { status: 400 });
    }

    const paidAt = new Date().toISOString();

    // Mark order paid (idempotent under concurrency)
    const { data: updatedOrders, error: updateOrderError } = await supabase
      .from("razorpay_orders")
      .update({ payment_id, status: "paid", paid_at: paidAt })
      .eq("order_id", order_id)
      .neq("status", "paid")
      .select("order_id");

    if (updateOrderError) {
      return NextResponse.json({ error: updateOrderError.message }, { status: 500 });
    }

    if (!updatedOrders || updatedOrders.length === 0) {
      // Another worker/webhook already processed it.
      return NextResponse.json({ success: true, message: "Already processed" });
    }

    // Increment company extra_user_seats
    const { data: companyRow, error: companyError } = await supabase
      .from("companies")
      .select("id, extra_user_seats")
      .eq("id", parsed.companyId)
      .maybeSingle();

    if (companyError) {
      return NextResponse.json({ error: companyError.message }, { status: 500 });
    }

    if (!companyRow) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const currentExtra = Number((companyRow as any).extra_user_seats ?? 0);
    const nextExtra = currentExtra + parsed.qty;

    const { error: companyUpdateError } = await supabase
      .from("companies")
      .update({ extra_user_seats: nextExtra, updated_at: paidAt })
      .eq("id", parsed.companyId);

    if (companyUpdateError) {
      return NextResponse.json({ error: companyUpdateError.message }, { status: 500 });
    }

    try {
      await writeAuditLog({
        companyId: parsed.companyId,
        actor: "system",
        action: "addon_userid_activated",
        status: "success",
        integrationSystem: "razorpay",
        metadata: { order_id, payment_id, qty: parsed.qty, extra_user_seats: nextExtra },
      });
    } catch {
      // Don't fail the payment flow if audit logging fails
    }

    return NextResponse.json({ success: true, company_id: parsed.companyId, added: parsed.qty, extra_user_seats: nextExtra });
  } catch (error: any) {
    // Best-effort: try to record failure if we can infer company
    try {
      const body = await req.json().catch(() => ({}));
      const orderId = body?.order_id as string | undefined;
      if (orderId) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: orderRecord } = await supabase
          .from("razorpay_orders")
          .select("purpose")
          .eq("order_id", orderId)
          .maybeSingle();
        const parsed = orderRecord?.purpose ? parsePurpose(String(orderRecord.purpose)) : null;
        if (parsed) {
          await writeAuditLog({
            companyId: parsed.companyId,
            actor: "system",
            action: "addon_userid_activated",
            status: "failed",
            integrationSystem: "razorpay",
            metadata: { order_id: orderId, error: error.message || String(error) },
          });
        }
      }
    } catch {
      // ignore
    }
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
