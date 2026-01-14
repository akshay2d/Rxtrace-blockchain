import Razorpay from "razorpay";
import { NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function buildRazorpayReceipt() {
  // Razorpay receipt has a strict max length (40 chars). Keep it short and unique.
  // Example: rx_1700000000000_ab12cd
  const suffix = Math.random().toString(16).slice(2, 8);
  return `rx_${Date.now()}_${suffix}`.slice(0, 40);
}

function formatRazorpayError(e: any) {
  const status = e?.statusCode ?? e?.status ?? e?.httpStatusCode;
  const code = e?.error?.code ?? e?.code;
  const description =
    e?.error?.description ??
    e?.error?.reason ??
    e?.error?.message ??
    e?.description ??
    e?.message;

  const parts = [description, code ? `code=${code}` : null, status ? `status=${status}` : null].filter(Boolean);
  return parts.length ? parts.join(' | ') : 'Failed to create Razorpay order';
}

function keyIdSource(): 'RAZORPAY_KEY_ID' | 'NEXT_PUBLIC_RAZORPAY_KEY_ID' | 'missing' {
  if (process.env.RAZORPAY_KEY_ID) return 'RAZORPAY_KEY_ID';
  if (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) return 'NEXT_PUBLIC_RAZORPAY_KEY_ID';
  return 'missing';
}

async function createOrder(input: { amount: unknown; purpose: unknown }) {
  const { amount, purpose } = input;

  const keyId = process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return NextResponse.json(
      {
        error:
          "Razorpay not configured. Set RAZORPAY_KEY_ID (or NEXT_PUBLIC_RAZORPAY_KEY_ID) and RAZORPAY_KEY_SECRET in your environment.",
      },
      { status: 500 }
    );
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      {
        error:
          "Server misconfigured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (required to store Razorpay orders for activation).",
      },
      { status: 500 }
    );
  }

  if (amount === undefined || purpose === undefined) {
    return NextResponse.json(
      { error: "amount and purpose required" },
      { status: 400 }
    );
  }

  const numericAmount = typeof amount === "string" ? Number(amount) : amount;
  if (typeof numericAmount !== "number" || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    return NextResponse.json(
      { error: "amount must be a positive number" },
      { status: 400 }
    );
  }

  if (typeof purpose !== "string" || purpose.trim().length === 0) {
    return NextResponse.json(
      { error: "purpose must be a non-empty string" },
      { status: 400 }
    );
  }

  const razorpay = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });

  const amountInPaise = Math.round(numericAmount * 100); // INR → paise

  let order: any;
  try {
    order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: buildRazorpayReceipt(),
      notes: {
        purpose: purpose.trim(),
        created_at: new Date().toISOString(),
      },
    });
  } catch (e: any) {
    const formatted = formatRazorpayError(e);
    const status = e?.statusCode ?? e?.status ?? e?.httpStatusCode;
    const code = e?.error?.code ?? e?.code;
    const keyIdUsed = keyId ? String(keyId) : null;
    const source = keyIdSource();

    // Common failure: mismatched key_id/key_secret or wrong mode.
    const hint =
      status === 401 || code === 'BAD_REQUEST_ERROR'
        ? 'Check that RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET belong to the same Razorpay account/mode (LIVE vs TEST), and that your deploy has been restarted after env changes.'
        : undefined;

    return NextResponse.json(
      {
        error: formatted,
        razorpay: {
          keyId: keyIdUsed,
          keyIdSource: source,
          hint,
        },
      },
      { status: 502 }
    );
  }

  // Store order in database (required for later activation/verification)
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { error: insertErr } = await supabase
    .from('razorpay_orders')
    .insert({
      order_id: order.id,
      amount: numericAmount,
      amount_paise: amountInPaise,
      currency: order.currency,
      receipt: order.receipt,
      status: order.status,
      purpose: purpose.trim(),
      created_at: new Date().toISOString(),
    });
  if (insertErr) {
    console.error('Failed to store order in database:', insertErr);
    return NextResponse.json(
      {
        error:
          `Order created in Razorpay but failed to store in DB (razorpay_orders). ${insertErr.message}`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ order, keyId });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    return await createOrder(body);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Razorpay error" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const amount = url.searchParams.get("amount");
    const purpose = url.searchParams.get("purpose");
    return await createOrder({ amount, purpose });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Razorpay error" },
      { status: 500 }
    );
  }
}
