import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/audit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureActiveBillingUsage } from "@/lib/billing/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type AddonKind = "unit" | "box" | "carton" | "pallet" | "userid";

function parseAddonPurpose(purpose: string): { kind: AddonKind; companyId: string; qty: number } | null {
  // Expected: addon_<kind>_company_<companyId>_qty_<qty>
  // ERP removed: 1 ERP per user_id is FREE (not sold as add-on)
  const match = purpose.match(/^addon_(unit|box|carton|pallet|userid)_company_(.+)_qty_(\d+)$/);
  if (!match) return null;
  const kind = match[1] as AddonKind;
  const companyId = match[2];
  const qty = Number(match[3]);
  if (!companyId || !Number.isInteger(qty) || qty <= 0) return null;
  return { kind, companyId, qty };
}

function parseCartPurpose(purpose: string): { companyId: string; cartId: string } | null {
  // Expected: addon_cart_company_<companyId>_cart_<cartId>
  const match = purpose.match(/^addon_cart_company_(.+)_cart_(.+)$/);
  if (!match) return null;
  const companyId = match[1];
  const cartId = match[2];
  if (!companyId || !cartId) return null;
  return { companyId, cartId };
}

function normalizeCartItems(raw: unknown): Array<{ kind: AddonKind; qty: number }> {
  const items: Array<{ kind: AddonKind; qty: number }> = [];
  if (!Array.isArray(raw)) return items;

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as any;
    const kindRaw = String(obj.kind ?? obj.key ?? obj.type ?? "").trim().toLowerCase();
    const qtyRaw = obj.qty ?? obj.quantity ?? obj.count;
    const qty = typeof qtyRaw === "string" ? Number(qtyRaw) : Number(qtyRaw);

    if (
      (kindRaw === "unit" ||
        kindRaw === "box" ||
        kindRaw === "carton" ||
        kindRaw === "pallet" ||
        kindRaw === "userid") &&
      Number.isInteger(qty) &&
      qty > 0
    ) {
      items.push({ kind: kindRaw as AddonKind, qty });
    }
  }

  return items;
}

function itemKey(item: { kind: AddonKind; qty: number }) {
  return `${item.kind}:${item.qty}`;
}

async function ensureAddonInvoice(params: {
  admin: any;
  companyId: string;
  orderId: string;
  paymentId: string;
  paidAt: string;
  currency?: string | null;
  amountInr: number;
  metadata: any;
}) {
  const { admin, companyId, orderId, paymentId, paidAt, currency, amountInr, metadata } = params;

  const reference = `razorpay_order:${orderId}`;

  const { data: existing, error: existingErr } = await admin
    .from('billing_invoices')
    .select('id')
    .eq('company_id', companyId)
    .eq('reference', reference)
    .maybeSingle();

  if (existingErr) throw new Error(existingErr.message);
  if (existing?.id) return { id: existing.id, created: false };

  const amount = Number.isFinite(amountInr) ? Number(amountInr.toFixed(2)) : 0;
  if (!amount || amount <= 0) throw new Error('Invalid invoice amount');

  const base = 0;
  const addons = amount;

  const invoiceRowWithOptionalColumns: any = {
    company_id: companyId,
    plan: 'Add-ons',
    period_start: paidAt,
    period_end: paidAt,
    amount,
    currency: currency ?? 'INR',
    status: 'PAID',
    paid_at: paidAt,
    reference,
    // Optional columns (may not exist if migrations weren't applied yet)
    provider: 'razorpay',
    provider_invoice_id: orderId,
    provider_payment_id: paymentId,
    base_amount: base,
    addons_amount: addons,
    wallet_applied: 0,
    metadata: {
      ...(metadata ?? {}),
      pricing: { base, addons },
      razorpay: { order_id: orderId, payment_id: paymentId },
      created_by: 'system',
    },
  };

  const invoiceRowMinimal: any = {
    company_id: companyId,
    plan: 'Add-ons',
    period_start: paidAt,
    period_end: paidAt,
    amount,
    currency: currency ?? 'INR',
    status: 'PAID',
    paid_at: paidAt,
    reference,
    metadata: {
      ...(metadata ?? {}),
      pricing: { base, addons },
      razorpay: { order_id: orderId, payment_id: paymentId },
      created_by: 'system',
    },
  };

  // Try inserting with optional columns first; if schema doesn't have them, retry minimal.
  const firstAttempt = await admin
    .from('billing_invoices')
    .insert(invoiceRowWithOptionalColumns)
    .select('id')
    .maybeSingle();

  if (!firstAttempt.error) {
    return { id: firstAttempt.data?.id ?? null, created: true };
  }

  const msg = String(firstAttempt.error.message ?? firstAttempt.error);
  const looksLikeMissingColumn = /column .* does not exist/i.test(msg);
  if (!looksLikeMissingColumn) throw new Error(msg);

  const secondAttempt = await admin
    .from('billing_invoices')
    .insert(invoiceRowMinimal)
    .select('id')
    .maybeSingle();

  if (secondAttempt.error) throw new Error(String(secondAttempt.error.message ?? secondAttempt.error));
  return { id: secondAttempt.data?.id ?? null, created: true };
}

async function applySingleAddon(params: {
  supabase: any;
  admin: any;
  companyId: string;
  kind: AddonKind;
  qty: number;
  orderId: string;
  paymentId: string;
  paidAt: string;
}) {
  const { supabase, admin, companyId, kind, qty, orderId, paymentId, paidAt } = params;

  if (kind === "userid") {
    const { data: companyRow, error: companyError } = await supabase
      .from("companies")
      .select("id, extra_user_seats")
      .eq("id", companyId)
      .maybeSingle();

    if (companyError) throw new Error(companyError.message);
    if (!companyRow) throw new Error("Company not found");

    const currentExtra = Number((companyRow as any).extra_user_seats ?? 0);
    const nextExtra = currentExtra + qty;

    const { error: companyUpdateError } = await supabase
      .from("companies")
      .update({ extra_user_seats: nextExtra, updated_at: paidAt })
      .eq("id", companyId);

    if (companyUpdateError) throw new Error(companyUpdateError.message);

    await writeAuditLog({
      companyId,
      actor: "system",
      action: "addon_userid_activated",
      status: "success",
      integrationSystem: "razorpay",
      metadata: { order_id: orderId, payment_id: paymentId, qty, extra_user_seats: nextExtra },
    }).catch(() => undefined);

    return { kind, qty, extra_user_seats: nextExtra };
  }

  // ERP removed: 1 ERP per user_id is FREE (not sold as add-on)
  // ERP integration limit is enforced in /api/integrations/save route using user_id check

  await ensureActiveBillingUsage({ supabase: admin, companyId });
  const { data: addRow, error: addErr } = await admin.rpc("billing_usage_add_quota", {
    p_company_id: companyId,
    p_kind: kind,
    p_qty: qty,
  });

  const added = Array.isArray(addRow) ? (addRow as any[])[0] : (addRow as any);
  if (addErr || !added?.ok) {
    throw new Error(added?.error ?? addErr?.message ?? "Failed to add quota");
  }

  await writeAuditLog({
    companyId,
    actor: "system",
    action: `addon_${kind}_activated`,
    status: "success",
    integrationSystem: "razorpay",
    metadata: { order_id: orderId, payment_id: paymentId, qty, remaining: added.remaining },
  }).catch(() => undefined);

  return { kind, qty, remaining: added.remaining };
}

async function applyAddon(opts: { orderId: string; paymentId: string; signature?: string | null }) {
  const { orderId, paymentId, signature } = opts;

  const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!razorpayKeySecret) {
    return { ok: false as const, status: 500, error: "Payment gateway not configured" };
  }

  if (signature) {
    const expectedSignature = crypto
      .createHmac("sha256", razorpayKeySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    if (expectedSignature !== signature) {
      return { ok: false as const, status: 401, error: "Invalid payment signature" };
    }
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: orderRecord, error: orderError } = await supabase
    .from("razorpay_orders")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  if (orderError) {
    return { ok: false as const, status: 500, error: orderError.message };
  }

  if (!orderRecord) {
    return { ok: false as const, status: 404, error: "Order not found" };
  }

  const purpose = String((orderRecord as any).purpose ?? "");
  const parsed = parseAddonPurpose(purpose);
  const parsedCart = parsed ? null : parseCartPurpose(purpose);
  if (!parsed && !parsedCart) {
    return { ok: false as const, status: 400, error: "This order is not a supported add-on" };
  }

  const paidAt = new Date().toISOString();

  // Mark order paid (idempotent)
  const { data: updatedOrders, error: updateOrderError } = await supabase
    .from("razorpay_orders")
    .update({ payment_id: paymentId, status: "paid", paid_at: paidAt })
    .eq("order_id", orderId)
    .neq("status", "paid")
    .select("order_id");

  if (updateOrderError) {
    return { ok: false as const, status: 500, error: updateOrderError.message };
  }

  if (!updatedOrders || updatedOrders.length === 0) {
    try {
      const admin = getSupabaseAdmin();
      const amountInr = Number((orderRecord as any).amount ?? 0);
      const currency = (orderRecord as any).currency ?? 'INR';

      if (parsed) {
        await ensureAddonInvoice({
          admin,
          companyId: parsed.companyId,
          orderId,
          paymentId,
          paidAt: (orderRecord as any).paid_at ?? paidAt,
          currency,
          amountInr,
          metadata: { type: 'addon', kind: parsed.kind, qty: parsed.qty },
        });
      } else if (parsedCart) {
        await ensureAddonInvoice({
          admin,
          companyId: parsedCart.companyId,
          orderId,
          paymentId,
          paidAt: (orderRecord as any).paid_at ?? paidAt,
          currency,
          amountInr,
          metadata: { type: 'addon_cart', cart_id: parsedCart.cartId },
        });
      }
    } catch {
      // Don't fail activation for invoice creation; webhook can retry.
    }

    if (parsed) return { ok: true as const, alreadyProcessed: true, ...parsed };
    return { ok: true as const, alreadyProcessed: true, ...(parsedCart as any) };
  }

  try {
    const admin = getSupabaseAdmin();

    if (parsed) {
      const applied = await applySingleAddon({
        supabase,
        admin,
        companyId: parsed.companyId,
        kind: parsed.kind,
        qty: parsed.qty,
        orderId,
        paymentId,
        paidAt,
      });

      await ensureAddonInvoice({
        admin,
        companyId: parsed.companyId,
        orderId,
        paymentId,
        paidAt,
        currency: (orderRecord as any).currency ?? 'INR',
        amountInr: Number((orderRecord as any).amount ?? 0),
        metadata: { type: 'addon', kind: parsed.kind, qty: parsed.qty },
      }).catch(() => undefined);

      return { ok: true as const, ...parsed, ...applied };
    }

    const cartInfo = parsedCart!;
    const { data: cartRow, error: cartErr } = await supabase
      .from("addon_carts")
      .select("*")
      .eq("id", cartInfo.cartId)
      .eq("company_id", cartInfo.companyId)
      .maybeSingle();

    if (cartErr) throw new Error(cartErr.message);
    if (!cartRow) throw new Error("Cart not found");

    const cartStatus = String((cartRow as any).status ?? "");
    if (cartStatus === "applied") {
      return { ok: true as const, alreadyProcessed: true, ...cartInfo };
    }

    const orderAmountPaise = Number((orderRecord as any).amount_paise ?? 0);
    const cartTotalPaise = Number((cartRow as any).total_paise ?? 0);
    if (Number.isFinite(orderAmountPaise) && Number.isFinite(cartTotalPaise) && cartTotalPaise > 0) {
      if (orderAmountPaise !== cartTotalPaise) {
        throw new Error("Order amount mismatch for cart");
      }
    }

    const existingOrderId = (cartRow as any).order_id as string | null | undefined;
    if (existingOrderId && existingOrderId !== orderId) {
      throw new Error("Cart is linked to a different order");
    }

    // Link cart to order (idempotent)
    if (!existingOrderId) {
      const { error: linkErr } = await supabase
        .from("addon_carts")
        .update({ order_id: orderId, status: "paid" })
        .eq("id", cartInfo.cartId)
        .eq("company_id", cartInfo.companyId);
      if (linkErr) throw new Error(linkErr.message);
    }

    const items = normalizeCartItems((cartRow as any).items);
    if (items.length === 0) {
      throw new Error("Cart has no valid items");
    }

    const appliedItems = normalizeCartItems((cartRow as any).applied_items);
    const appliedSet = new Set(appliedItems.map(itemKey));

    const results: any[] = [];
    for (const item of items) {
      if (appliedSet.has(itemKey(item))) continue;

      const applied = await applySingleAddon({
        supabase,
        admin,
        companyId: cartInfo.companyId,
        kind: item.kind,
        qty: item.qty,
        orderId,
        paymentId,
        paidAt,
      });

      results.push(applied);
      appliedItems.push({ kind: item.kind, qty: item.qty });
      appliedSet.add(itemKey(item));

      // Persist progress so retries/webhooks won't double-apply.
      await supabase
        .from("addon_carts")
        .update({ applied_items: appliedItems, status: "applying" })
        .eq("id", cartInfo.cartId)
        .eq("company_id", cartInfo.companyId);
    }

    await supabase
      .from("addon_carts")
      .update({ status: "applied", applied_at: paidAt, applied_items: appliedItems })
      .eq("id", cartInfo.cartId)
      .eq("company_id", cartInfo.companyId);

    await ensureAddonInvoice({
      admin,
      companyId: cartInfo.companyId,
      orderId,
      paymentId,
      paidAt,
      currency: (orderRecord as any).currency ?? 'INR',
      amountInr: Number((orderRecord as any).amount ?? 0),
      metadata: { type: 'addon_cart', cart_id: cartInfo.cartId, items },
    }).catch(() => undefined);

    return { ok: true as const, ...cartInfo, items: appliedItems, results };
  } catch (e: any) {
    const companyId = parsed?.companyId ?? parsedCart?.companyId;
    const action = parsed ? `addon_${parsed.kind}_activated` : "addon_cart_activated";
    if (companyId) {
      await writeAuditLog({
        companyId,
        actor: "system",
        action,
        status: "failed",
        integrationSystem: "razorpay",
        metadata: { order_id: orderId, payment_id: paymentId, error: e?.message ?? String(e) },
      }).catch(() => undefined);
    }

    return { ok: false as const, status: 500, error: e?.message ?? "Failed to apply add-on" };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { payment_id, order_id, signature } = await req.json();

    if (!payment_id || !order_id) {
      return NextResponse.json({ error: "payment_id and order_id are required" }, { status: 400 });
    }

    const result = await applyAddon({
      orderId: String(order_id),
      paymentId: String(payment_id),
      signature: signature ? String(signature) : null,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: (result as any).status ?? 500 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
