import Razorpay from "razorpay";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCompanyForUser } from "@/lib/company/resolve";
import { fetchAddonPricesFromDb, getPricePaise, type AddonKind } from "@/lib/billing/addon-pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function normalizeItems(raw: unknown): CartItemInput[] {
  if (!Array.isArray(raw)) return [];

  const normalized: CartItemInput[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as any;

    const kind = String(obj.kind ?? obj.key ?? obj.type ?? "").trim().toLowerCase() as AddonKind;
    const qtyRaw = obj.qty ?? obj.quantity ?? obj.count;
    const qty = typeof qtyRaw === "string" ? Number(qtyRaw) : Number(qtyRaw);

    const validKind = kind === "unit" || kind === "box" || kind === "carton" || kind === "pallet" || kind === "userid";
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

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const resolved = await resolveCompanyForUser(admin, user.id, "id");
    if (!resolved) {
      return NextResponse.json({ error: "No company found" }, { status: 404 });
    }
    // RXTrace Gate: Only owner can purchase add-ons. Seat users can view cost only.
    if (!resolved.isOwner) {
      return NextResponse.json(
        { error: "Only company owner can purchase add-ons. Contact your company admin." },
        { status: 403 }
      );
    }
    const companyId = resolved.companyId;

    const body = await req.json().catch(() => ({}));
    const requestedCompanyId = body.company_id as string | undefined;
    if (requestedCompanyId && requestedCompanyId !== companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const items = normalizeItems(body.items);
    if (items.length === 0) {
      return NextResponse.json({ error: "items required" }, { status: 400 });
    }

    const priceMap = await fetchAddonPricesFromDb(admin);
    const totalPaise = items.reduce((sum, item) => sum + getPricePaise(priceMap, item.kind) * item.qty, 0);
    if (!Number.isInteger(totalPaise) || totalPaise <= 0) {
      return NextResponse.json({ error: "Invalid total" }, { status: 400 });
    }

    // Coupon: validate and compute discount for add-on cart
    let couponId: string | null = null;
    let discountPaise = 0;
    const couponCode = typeof body.coupon_code === "string" ? body.coupon_code.trim() : null;
    if (couponCode) {
      const { data: couponRow } = await admin
        .from("discounts")
        .select("id, code, type, value, valid_from, valid_to, usage_limit, usage_count, is_active")
        .ilike("code", couponCode.toLowerCase())
        .eq("is_active", true)
        .maybeSingle();
      if (couponRow) {
        const now = new Date();
        const vFrom = new Date((couponRow as any).valid_from);
        const vTo = (couponRow as any).valid_to ? new Date((couponRow as any).valid_to) : null;
        const limit = (couponRow as any).usage_limit;
        const used = (couponRow as any).usage_count ?? 0;
        const { data: assign } = await admin
          .from("company_discounts")
          .select("id")
          .eq("company_id", companyId)
          .eq("discount_id", (couponRow as any).id)
          .maybeSingle();
        if (vFrom <= now && (!vTo || vTo >= now) && (limit == null || used < limit) && assign) {
          const amountInr = totalPaise / 100;
          const typ = (couponRow as any).type;
          const val = Number((couponRow as any).value ?? 0);
          const discountInr = typ === "percentage" ? Math.min(amountInr * (val / 100), amountInr) : Math.min(val, amountInr);
          discountPaise = Math.round(discountInr * 100);
          couponId = (couponRow as any).id;
        }
      }
    }

    const orderAmountPaise = Math.max(100, totalPaise - discountPaise);

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

    // Create cart record (with optional coupon)
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
        ...(couponId ? { coupon_id: couponId, discount_paise: discountPaise } : {}),
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
        amount: orderAmountPaise,
        currency: "INR",
        receipt: buildRazorpayReceipt(),
        notes: {
          purpose,
          cart_id: cartId,
          company_id: companyId,
          created_at: new Date().toISOString(),
          ...(couponId ? { coupon_id: couponId, discount_paise: String(discountPaise) } : {}),
        },
      });
    } catch (e: any) {
      return NextResponse.json({ error: formatRazorpayError(e) }, { status: 502 });
    }

    // Store order record (amount paid = orderAmountPaise)
    const amountInr = orderAmountPaise / 100;
    const { error: orderInsertErr } = await admin.from("razorpay_orders").insert({
      order_id: order.id,
      amount: amountInr,
      amount_paise: orderAmountPaise,
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

    return NextResponse.json({
      order,
      keyId,
      cartId,
      totalPaise,
      orderAmountPaise,
      discountPaise: discountPaise || 0,
      items,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
