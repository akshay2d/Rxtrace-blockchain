import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { requireOwnerContext } from "@/lib/billing/userSubscriptionAuth";
import { getOrGenerateCorrelationId } from "@/lib/observability/correlation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toPositiveInt(value: unknown): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function basicAuthHeader(keyId: string, keySecret: string) {
  const token = Buffer.from(`${keyId}:${keySecret}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

function normalizeStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

const ALLOWED_PENDING_STATUSES = new Set([
  "created",
  "quote_locked",
  "subscription_initiated",
  "subscription_paid",
  "topup_initiated",
  "topup_paid",
  "partial_success",
  "failed",
  "expired",
  "cancelled",
]);

export async function POST(req: NextRequest) {
  const owner = await requireOwnerContext();
  if (!owner.ok) return owner.response;

  try {
    const correlationId = getOrGenerateCorrelationId(await headers(), "user");
    const body = await req.json().catch(() => ({}));
    const checkoutSessionId = String((body as any)?.checkout_session_id || "").trim();
    if (!checkoutSessionId) {
      return NextResponse.json({ error: "checkout_session_id is required" }, { status: 400 });
    }

    const { data: session, error: sessionError } = await owner.supabase
      .from("checkout_sessions")
      .select(
        "id, company_id, owner_user_id, status, expires_at, provider_topup_order_id, quote_payload_json, totals_json, selected_plan_template_id, selected_plan_version_id, metadata"
      )
      .eq("id", checkoutSessionId)
      .eq("company_id", owner.companyId)
      .eq("owner_user_id", owner.userId)
      .maybeSingle();

    if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
    if (!session) return NextResponse.json({ error: "CHECKOUT_SESSION_NOT_FOUND" }, { status: 404 });

    const sessionStatus = normalizeStatus((session as any).status);
    if (sessionStatus === "completed") {
      return NextResponse.json({ error: "CHECKOUT_SESSION_ALREADY_COMPLETED" }, { status: 409 });
    }
    if (!ALLOWED_PENDING_STATUSES.has(sessionStatus)) {
      return NextResponse.json({ error: "CHECKOUT_SESSION_NOT_PAYABLE" }, { status: 409 });
    }

    const expiresAtMs = new Date(String((session as any).expires_at || "")).getTime();
    if (Number.isNaN(expiresAtMs) || Date.now() > expiresAtMs) {
      await owner.supabase
        .from("checkout_sessions")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", checkoutSessionId);
      return NextResponse.json({ error: "CHECKOUT_SESSION_EXPIRED" }, { status: 409 });
    }

    const expectedAmountPaise = toPositiveInt((session as any)?.totals_json?.grand_total_paise);
    if (expectedAmountPaise <= 0) {
      return NextResponse.json({ error: "INVALID_CHECKOUT_AMOUNT" }, { status: 400 });
    }

    const keyId = process.env.RAZORPAY_KEY_ID?.trim();
    const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: "RAZORPAY_NOT_CONFIGURED" }, { status: 503 });
    }

    const existingOrderId = String((session as any).provider_topup_order_id || "").trim();
    if (existingOrderId) {
      return NextResponse.json({
        success: true,
        replay: true,
        correlation_id: correlationId,
        checkout_session: {
          id: (session as any).id,
          status: (session as any).status,
          selected_plan_template_id: (session as any).selected_plan_template_id,
          selected_plan_version_id: (session as any).selected_plan_version_id,
          quote: (session as any).quote_payload_json,
          totals: (session as any).totals_json,
        },
        razorpay: {
          key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || null,
          order_id: existingOrderId,
          amount_paise: expectedAmountPaise,
          currency: "INR",
        },
      });
    }

    const receipt = `checkout:${checkoutSessionId}:${Date.now()}`;
    const createRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        authorization: basicAuthHeader(keyId, keySecret),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        amount: expectedAmountPaise,
        currency: "INR",
        receipt,
        notes: {
          purpose: "subscription_checkout",
          checkout_session_id: checkoutSessionId,
          company_id: owner.companyId,
          owner_user_id: owner.userId,
          correlation_id: correlationId,
        },
      }),
    });

    const createBodyText = await createRes.text();
    if (!createRes.ok) {
      return NextResponse.json(
        { error: "RAZORPAY_ORDER_CREATE_FAILED", detail: createBodyText, correlation_id: correlationId },
        { status: 502 }
      );
    }

    let created: any;
    try {
      created = JSON.parse(createBodyText);
    } catch {
      return NextResponse.json(
        { error: "RAZORPAY_ORDER_CREATE_FAILED", detail: "Invalid Razorpay response", correlation_id: correlationId },
        { status: 502 }
      );
    }

    const orderId = String(created?.id || "").trim();
    if (!orderId) {
      return NextResponse.json(
        { error: "RAZORPAY_ORDER_CREATE_FAILED", detail: "Missing order id", correlation_id: correlationId },
        { status: 502 }
      );
    }

    const now = new Date().toISOString();
    const { error: updateSessionError } = await owner.supabase
      .from("checkout_sessions")
      .update({
        provider_topup_order_id: orderId,
        status: "topup_initiated",
        metadata: {
          ...((session as any).metadata || {}),
          phase: "phase_3_payment_initiated",
          payment_order_created_at: now,
          payment_order_id: orderId,
          payment_amount_paise: expectedAmountPaise,
        },
        updated_at: now,
      })
      .eq("id", checkoutSessionId)
      .eq("company_id", owner.companyId)
      .in("status", Array.from(ALLOWED_PENDING_STATUSES));

    if (updateSessionError) {
      return NextResponse.json({ error: updateSessionError.message }, { status: 500 });
    }

    const { error: orderInsertError } = await owner.supabase.from("razorpay_orders").insert({
      order_id: orderId,
      payment_id: null,
      amount: expectedAmountPaise / 100,
      amount_paise: expectedAmountPaise,
      currency: "INR",
      receipt,
      status: String(created?.status || "created"),
      purpose: `checkout_session_${checkoutSessionId}`,
    });
    if (orderInsertError && !String(orderInsertError.message || "").toLowerCase().includes("duplicate")) {
      return NextResponse.json({ error: orderInsertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      correlation_id: correlationId,
      checkout_session: {
        id: (session as any).id,
        status: "topup_initiated",
        selected_plan_template_id: (session as any).selected_plan_template_id,
        selected_plan_version_id: (session as any).selected_plan_version_id,
        quote: (session as any).quote_payload_json,
        totals: (session as any).totals_json,
      },
      razorpay: {
        key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || null,
        order_id: orderId,
        amount_paise: expectedAmountPaise,
        currency: "INR",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to initiate Razorpay checkout payment" },
      { status: 500 }
    );
  }
}
