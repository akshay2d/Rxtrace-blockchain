import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/audit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureActiveBillingUsage } from "@/lib/billing/usage";
import { trySyncBillingInvoiceToZoho } from "@/lib/billing/zohoInvoiceSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function verifyRazorpayWebhookSignature(rawBody: string, signature: string | null, webhookSecret: string | undefined): boolean {
  if (!signature || !webhookSecret) return false;
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  const encoder = new TextEncoder();
  const a = encoder.encode(expected);
  const b = encoder.encode(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

type AddonKind = "unit" | "box" | "carton" | "pallet" | "userid" | "erp";

async function ensureSubscriptionInvoice(params: {
  admin: any;
  companyId: string;
  providerInvoiceId: string;
  providerPaymentId: string | null;
  paidAt: string;
  periodStart: string;
  periodEnd: string;
  currency?: string | null;
  amountInr: number;
  planLabel: string;
  metadata: any;
}) {
  const {
    admin,
    companyId,
    providerInvoiceId,
    providerPaymentId,
    paidAt,
    periodStart,
    periodEnd,
    currency,
    amountInr,
    planLabel,
    metadata,
  } = params;

  const reference = `razorpay_invoice:${providerInvoiceId}`;

  const { data: existing, error: existingErr } = await admin
    .from('billing_invoices')
    .select('id')
    .eq('company_id', companyId)
    .eq('reference', reference)
    .maybeSingle();

  if (existingErr) throw new Error(existingErr.message);
  if (existing?.id) {
    trySyncBillingInvoiceToZoho(String(existing.id)).catch(() => undefined);
    return { id: existing.id, created: false };
  }

  const amount = Number.isFinite(amountInr) ? Number(amountInr.toFixed(2)) : 0;
  if (!amount || amount <= 0) throw new Error('Invalid invoice amount');

  const invoiceRowWithOptionalColumns: any = {
    company_id: companyId,
    plan: planLabel,
    period_start: periodStart,
    period_end: periodEnd,
    amount,
    currency: currency ?? 'INR',
    status: 'PAID',
    paid_at: paidAt,
    reference,
    // Optional columns (may not exist if migrations weren't applied yet)
    provider: 'razorpay',
    provider_invoice_id: providerInvoiceId,
    provider_payment_id: providerPaymentId,
    base_amount: amount,
    addons_amount: 0,
    wallet_applied: 0,
    metadata: {
      ...(metadata ?? {}),
      pricing: { base: amount, addons: 0 },
      razorpay: { invoice_id: providerInvoiceId, payment_id: providerPaymentId },
      created_by: 'system',
    },
  };

  const invoiceRowMinimal: any = {
    company_id: companyId,
    plan: planLabel,
    period_start: periodStart,
    period_end: periodEnd,
    amount,
    currency: currency ?? 'INR',
    status: 'PAID',
    paid_at: paidAt,
    reference,
    metadata: {
      ...(metadata ?? {}),
      pricing: { base: amount, addons: 0 },
      razorpay: { invoice_id: providerInvoiceId, payment_id: providerPaymentId },
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
    if (firstAttempt.data?.id) {
      trySyncBillingInvoiceToZoho(String(firstAttempt.data.id)).catch(() => undefined);
    }
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
  if (secondAttempt.data?.id) {
    trySyncBillingInvoiceToZoho(String(secondAttempt.data.id)).catch(() => undefined);
  }
  return { id: secondAttempt.data?.id ?? null, created: true };
}

function parsePurpose(purpose: string): { kind: AddonKind; companyId: string; qty: number } | null {
  // Expected: addon_<kind>_company_<companyId>_qty_<qty>
  const match = purpose.match(/^addon_(unit|box|carton|pallet|userid|erp)_company_(.+)_qty_(\d+)$/);
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
        kindRaw === "userid" ||
        kindRaw === "erp") &&
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
  paymentId: string | null;
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
  if (existing?.id) {
    trySyncBillingInvoiceToZoho(String(existing.id)).catch(() => undefined);
    return { id: existing.id, created: false };
  }

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
    if (firstAttempt.data?.id) {
      trySyncBillingInvoiceToZoho(String(firstAttempt.data.id)).catch(() => undefined);
    }
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
  if (secondAttempt.data?.id) {
    trySyncBillingInvoiceToZoho(String(secondAttempt.data.id)).catch(() => undefined);
  }
  return { id: secondAttempt.data?.id ?? null, created: true };
}

async function applySingleAddon(params: {
  supabase: any;
  admin: any;
  companyId: string;
  kind: AddonKind;
  qty: number;
  orderId: string;
  paymentId: string | null;
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
      action: "addon_userid_activated_webhook",
      status: "success",
      integrationSystem: "razorpay",
      metadata: { order_id: orderId, payment_id: paymentId, qty, extra_user_seats: nextExtra },
    }).catch(() => undefined);

    return { kind, qty, extra_user_seats: nextExtra };
  }

  if (kind === "erp") {
    const { data: companyRow, error: companyError } = await supabase
      .from("companies")
      .select("id, extra_erp_integrations")
      .eq("id", companyId)
      .maybeSingle();

    if (companyError) throw new Error(companyError.message);
    if (!companyRow) throw new Error("Company not found");

    const currentExtra = Number((companyRow as any).extra_erp_integrations ?? 0);
    const nextExtra = currentExtra + qty;

    const { error: companyUpdateError } = await supabase
      .from("companies")
      .update({ extra_erp_integrations: nextExtra, updated_at: paidAt })
      .eq("id", companyId);

    if (companyUpdateError) throw new Error(companyUpdateError.message);

    await writeAuditLog({
      companyId,
      actor: "system",
      action: "addon_erp_activated_webhook",
      status: "success",
      integrationSystem: "razorpay",
      metadata: { order_id: orderId, payment_id: paymentId, qty, extra_erp_integrations: nextExtra },
    }).catch(() => undefined);

    return { kind, qty, extra_erp_integrations: nextExtra };
  }

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
    action: `addon_${kind}_activated_webhook`,
    status: "success",
    integrationSystem: "razorpay",
    metadata: { order_id: orderId, payment_id: paymentId, qty, remaining: added.remaining },
  }).catch(() => undefined);

  return { kind, qty, remaining: added.remaining };
}

async function applyAddonFromOrder(orderId: string, paymentId: string | null) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: orderRecord, error: orderError } = await supabase
    .from("razorpay_orders")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  if (orderError) throw new Error(orderError.message);
  if (!orderRecord) throw new Error("Order not found");

  const purpose = String(orderRecord.purpose ?? "");
  const parsed = parsePurpose(purpose);
  const parsedCart = parsed ? null : parseCartPurpose(purpose);
  if (!parsed && !parsedCart) {
    return { ignored: true };
  }

  const paidAt = new Date().toISOString();

  const { data: updatedOrders, error: updateOrderError } = await supabase
    .from("razorpay_orders")
    .update({
      status: "paid",
      paid_at: paidAt,
      ...(paymentId ? { payment_id: paymentId } : {}),
    })
    .eq("order_id", orderId)
    .neq("status", "paid")
    .select("order_id");

  if (updateOrderError) throw new Error(updateOrderError.message);

  if (!updatedOrders || updatedOrders.length === 0) {
    try {
      const admin = getSupabaseAdmin();
      const amountInr = Number((orderRecord as any).amount ?? 0);
      const currency = (orderRecord as any).currency ?? 'INR';

      const purpose = String(orderRecord.purpose ?? '');
      const parsed = parsePurpose(purpose);
      const parsedCart = parsed ? null : parseCartPurpose(purpose);

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
      // ignore
    }

    return { alreadyProcessed: true };
  }

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

    return { alreadyProcessed: false, ...parsed, ...applied };
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
    return { alreadyProcessed: true, cart: true };
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

  if (!existingOrderId) {
    await supabase
      .from("addon_carts")
      .update({ order_id: orderId, status: "paid" })
      .eq("id", cartInfo.cartId)
      .eq("company_id", cartInfo.companyId);
  }

  const items = normalizeCartItems((cartRow as any).items);
  if (items.length === 0) throw new Error("Cart has no valid items");

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

  try {
    await writeAuditLog({
      companyId: cartInfo.companyId,
      actor: "system",
      action: "addon_cart_activated_webhook",
      status: "success",
      integrationSystem: "razorpay",
      metadata: { order_id: orderId, payment_id: paymentId, cart_id: cartInfo.cartId, items: appliedItems },
    });
  } catch {
    // ignore
  }

  return { alreadyProcessed: false, cart: true, cart_id: cartInfo.cartId, items: appliedItems, results };
}

export async function POST(req: Request) {
  // Razorpay webhook: verify signature using webhook secret
  // Configure env: RAZORPAY_WEBHOOK_SECRET
  try {
    const signature = req.headers.get("x-razorpay-signature");
    const rawBody = await req.text();

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const ok = verifyRazorpayWebhookSignature(rawBody, signature, webhookSecret);

    if (!ok) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const eventType = String(event?.event ?? "");

    // Subscription invoices (monthly/recurring)
    // Razorpay sends invoice.* events for subscription cycles. Create a billing invoice
    // so it shows up in the dashboard Billing → Invoices list.
    const invoiceEntity = event?.payload?.invoice?.entity;
    if (invoiceEntity?.id) {
      const admin = getSupabaseAdmin();

      const providerInvoiceId = String(invoiceEntity.id);
      const providerPaymentId = invoiceEntity.payment_id ? String(invoiceEntity.payment_id) : null;
      const currency = invoiceEntity.currency ? String(invoiceEntity.currency).toUpperCase() : 'INR';

      const amountPaise =
        typeof invoiceEntity.amount_paid === 'number'
          ? invoiceEntity.amount_paid
          : typeof invoiceEntity.amount === 'number'
            ? invoiceEntity.amount
            : typeof invoiceEntity.amount_due === 'number'
              ? invoiceEntity.amount_due
              : 0;

      const amountInr = Number(amountPaise) / 100;

      const paidAt =
        typeof invoiceEntity.paid_at === 'number'
          ? new Date(invoiceEntity.paid_at * 1000).toISOString()
          : new Date().toISOString();

      const periodStart =
        typeof invoiceEntity.period_start === 'number'
          ? new Date(invoiceEntity.period_start * 1000).toISOString()
          : paidAt;

      const periodEnd =
        typeof invoiceEntity.period_end === 'number'
          ? new Date(invoiceEntity.period_end * 1000).toISOString()
          : paidAt;

      const notesCompanyId = invoiceEntity?.notes?.company_id ? String(invoiceEntity.notes.company_id) : null;
      const subscriptionId = invoiceEntity.subscription_id ? String(invoiceEntity.subscription_id) : null;

      let companyId: string | null = notesCompanyId;
      if (!companyId && subscriptionId) {
        const { data: companyRow } = await admin
          .from('companies')
          .select('id, subscription_plan')
          .eq('razorpay_subscription_id', subscriptionId)
          .maybeSingle();
        companyId = (companyRow as any)?.id ?? null;
      }

      if (!companyId) {
        // Acknowledge to avoid retries, but we can't attribute this invoice.
        return NextResponse.json({ received: true, invoice: true, ignored: true, reason: 'company_not_found' });
      }

      const planFromNotes = invoiceEntity?.notes?.plan ? String(invoiceEntity.notes.plan) : null;
      const planLabel = planFromNotes ? `Subscription (${planFromNotes})` : 'Subscription';

      const status = String(invoiceEntity.status ?? '').toLowerCase();
      const isPaidEvent = eventType === 'invoice.paid' || status === 'paid';
      if (!isPaidEvent) {
        // Only create paid invoices for now.
        return NextResponse.json({ received: true, invoice: true, ignored: true, status });
      }

      try {
        await ensureSubscriptionInvoice({
          admin,
          companyId,
          providerInvoiceId,
          providerPaymentId,
          paidAt,
          periodStart,
          periodEnd,
          currency,
          amountInr,
          planLabel,
          metadata: {
            type: 'subscription',
            event: eventType,
            razorpay_subscription_id: subscriptionId,
          },
        });
      } catch (e) {
        // Don't fail webhook for invoice insert errors.
        console.error('Subscription invoice insert error:', e);
      }

      return NextResponse.json({ received: true, invoice: true }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }

    // Subscription lifecycle events
    const subscriptionEntity = event?.payload?.subscription?.entity;
    if (subscriptionEntity?.id) {
      const subId = String(subscriptionEntity.id);
      const status = String(subscriptionEntity.status ?? '').toLowerCase();
      const currentEnd = typeof subscriptionEntity.current_end === 'number' ? new Date(subscriptionEntity.current_end * 1000).toISOString() : null;
      const cancelAtCycleEnd = subscriptionEntity.cancel_at_cycle_end === 1 || subscriptionEntity.cancel_at_cycle_end === true;

      const admin = getSupabaseAdmin();
      const nextSubscriptionStatus =
        status === 'active'
          ? 'active'
          : status === 'cancelled' || status === 'completed'
            ? 'cancelled'
            : status === 'paused'
              ? 'paused'
              : null;

      await admin
        .from('companies')
        .update({
          razorpay_subscription_id: subId,
          razorpay_subscription_status: subscriptionEntity.status ?? null,
          razorpay_plan_id: subscriptionEntity.plan_id ?? null,
          subscription_cancel_at_period_end: cancelAtCycleEnd,
          subscription_current_period_end: currentEnd,
          ...(nextSubscriptionStatus ? { subscription_status: nextSubscriptionStatus } : {}),
          subscription_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('razorpay_subscription_id', subId);

      try {
        await writeAuditLog({
          companyId: String(subscriptionEntity?.notes?.company_id ?? ''),
          actor: 'system',
          action: `razorpay_subscription_${status || 'event'}`,
          status: 'success',
          integrationSystem: 'razorpay',
          metadata: { event: eventType, subscription_id: subId, status: subscriptionEntity.status, plan_id: subscriptionEntity.plan_id },
        });
      } catch {
        // ignore
      }

      return NextResponse.json({ received: true, subscription: true }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }

    // We only care about add-on order events that include order_id + payment_id
    const paymentEntity = event?.payload?.payment?.entity;
    const orderId = paymentEntity?.order_id as string | undefined;
    const paymentId = paymentEntity?.id as string | undefined;

    if (!orderId) {
      // Acknowledge unknown events; don't fail webhook
      return NextResponse.json({ received: true, ignored: true });
    }

    // For safety: only process on captured/paid style events
    const allowedEvents = new Set(["payment.captured", "order.paid"]);
    if (eventType && !allowedEvents.has(eventType)) {
      return NextResponse.json({ received: true, ignored: true, event: eventType });
    }

    const result = await applyAddonFromOrder(orderId, paymentId ?? null);

    return NextResponse.json({ received: true, ...result }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (err: any) {
    // Return 200 to avoid repeated webhook retries for non-recoverable parsing issues.
    // But include error for logs.
    console.error("Razorpay webhook error:", err);
    return NextResponse.json({ received: true, error: err.message || "Failed" });
  }
}
