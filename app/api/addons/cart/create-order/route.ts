import Razorpay from "razorpay";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PRICING } from "@/lib/billingConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type AddonKind = "unit" | "box" | "carton" | "pallet" | "userid" | "erp";

type CartItemInput = {
  kind: AddonKind;
  qty: number;
};

function buildRazorpayReceipt() {
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
  return parts.length ? parts.join(" | ") : "Failed to create Razorpay order";
}

function unitPricePaise(kind: AddonKind): number {
  if (kind === "unit") return Math.round(PRICING.unit_label * 100);
  if (kind === "box") return Math.round(PRICING.box_label * 100);
  if (kind === "carton") return Math.round(PRICING.carton_label * 100);
  if (kind === "pallet") return Math.round(PRICING.pallet_label * 100);
  if (kind === "userid") return Math.round(PRICING.seat_monthly * 100);
  if (kind === "erp") return Math.round(PRICING.erp_integration_monthly * 100);
  // exhaustive
  return 0;
}

function normalizeItems(raw: unknown): CartItemInput[] {
  if (!Array.isArray(raw)) return [];

  const normalized: CartItemInput[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as any;

    const kind = String(obj.kind ?? obj.key ?? obj.type ?? "").trim().toLowerCase() as AddonKind;
    const qtyRaw = obj.qty ?? obj.quantity ?? obj.count;
    const qty = typeof qtyRaw === "string" ? Number(qtyRaw) : Number(qtyRaw);

    const validKind = kind === "unit" || kind === "box" || kind === "carton" || kind === "pallet" || kind === "userid" || kind === "erp";
    if (!validKind) continue;
    if (!Number.isInteger(qty) || qty <= 0) continue;

    normalized.push({ kind, qty });
  }

  // Merge duplicates (same kind)
  const merged = new Map<AddonKind, number>();
  for (const item of normalized) {
    merged.set(item.kind, (merged.get(item.kind) ?? 0) + item.qty);
  }

  return Array.from(merged.entries()).map(([kind, qty]) => ({ kind, qty }));
}

async function resolveAuthCompanyId() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null as any, companyId: null as string | null };

  const admin = getSupabaseAdmin();
  const { data: company } = await admin
    .from("companies")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  return { user, companyId: (company as any)?.id ?? null };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const requestedCompanyId = body.company_id as string | undefined;

    const items = normalizeItems(body.items);
    if (items.length === 0) {
      return NextResponse.json({ error: "items required" }, { status: 400 });
    }

    const { user, companyId } = await resolveAuthCompanyId();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: "No company found" }, { status: 403 });

    if (requestedCompanyId && requestedCompanyId !== companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const totalPaise = items.reduce((sum, item) => sum + unitPricePaise(item.kind) * item.qty, 0);
    if (!Number.isInteger(totalPaise) || totalPaise <= 0) {
      return NextResponse.json({ error: "Invalid total" }, { status: 400 });
    }

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

    const admin = getSupabaseAdmin();

    // Create cart record first
    const { data: cartInsert, error: cartErr } = await admin
      .from("addon_carts")
      .insert({
        company_id: companyId,
        user_id: user.id,
        total_paise: totalPaise,
        currency: "INR",
        items,
        applied_items: [],
        status: "created",
        created_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();

    if (cartErr) {
      return NextResponse.json({ error: cartErr.message }, { status: 500 });
    }

    const cartId = String((cartInsert as any)?.id ?? "");
    if (!cartId) {
      return NextResponse.json({ error: "Failed to create cart" }, { status: 500 });
    }

    const purpose = `addon_cart_company_${companyId}_cart_${cartId}`;

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

    let order: any;
    try {
      order = await razorpay.orders.create({
        amount: totalPaise,
        currency: "INR",
        receipt: buildRazorpayReceipt(),
        notes: {
          purpose,
          cart_id: cartId,
          company_id: companyId,
          created_at: new Date().toISOString(),
        },
      });
    } catch (e: any) {
      return NextResponse.json({ error: formatRazorpayError(e) }, { status: 502 });
    }

    // Store order record
    const amountInr = totalPaise / 100;
    const { error: orderInsertErr } = await admin.from("razorpay_orders").insert({
      order_id: order.id,
      amount: amountInr,
      amount_paise: totalPaise,
      currency: order.currency,
      receipt: order.receipt,
      status: order.status,
      purpose,
      created_at: new Date().toISOString(),
    });

    if (orderInsertErr) {
      return NextResponse.json(
        { error: `Order created in Razorpay but failed to store in DB (razorpay_orders). ${orderInsertErr.message}` },
        { status: 500 }
      );
    }

    // Link cart to order
    const { error: cartLinkErr } = await admin
      .from("addon_carts")
      .update({ order_id: order.id, status: "order_created" })
      .eq("id", cartId)
      .eq("company_id", companyId);

    if (cartLinkErr) {
      return NextResponse.json(
        { error: `Order created but failed to link cart to order. ${cartLinkErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ order, keyId, cartId, totalPaise, items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
