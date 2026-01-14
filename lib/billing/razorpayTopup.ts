import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export type RazorpayVerifyPayload = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

export function verifyRazorpayPaymentSignature(opts: {
  orderId: string;
  paymentId: string;
  signature: string;
  keySecret: string;
}): boolean {
  const message = `${opts.orderId}|${opts.paymentId}`;
  const expected = crypto.createHmac('sha256', opts.keySecret).update(message).digest('hex');
  return timingSafeEqual(expected, opts.signature);
}

function parseTopupPurpose(purpose: string): { companyId: string } | null {
  // Expected: wallet_topup_company_<companyId>
  const match = purpose.match(/^wallet_topup_company_(.+)$/);
  if (!match) return null;
  const companyId = match[1];
  if (!companyId) return null;
  return { companyId };
}

export async function applyWalletTopupFromOrder(opts: { orderId: string; paymentId: string | null }) {
  const supabase = getSupabaseAdmin();

  const { data: orderRecord, error: orderError } = await supabase
    .from('razorpay_orders')
    .select('*')
    .eq('order_id', opts.orderId)
    .maybeSingle();

  if (orderError) throw new Error(orderError.message);
  if (!orderRecord) throw new Error('Order not found');

  const purpose = String((orderRecord as any).purpose ?? '');
  const parsed = parseTopupPurpose(purpose);
  if (!parsed) {
    return { ignored: true };
  }

  const amount = Number((orderRecord as any).amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid order amount');
  }

  const paidAt = new Date().toISOString();

  // Idempotency guard: only process if status is not already paid
  const { data: updatedOrders, error: updateOrderError } = await supabase
    .from('razorpay_orders')
    .update({
      status: 'paid',
      paid_at: paidAt,
      ...(opts.paymentId ? { payment_id: opts.paymentId } : {}),
    })
    .eq('order_id', opts.orderId)
    .neq('status', 'paid')
    .select('order_id');

  if (updateOrderError) throw new Error(updateOrderError.message);
  if (!updatedOrders || updatedOrders.length === 0) {
    return { alreadyProcessed: true, companyId: parsed.companyId, amount };
  }

  const { data: topupData, error: topupErr } = await supabase.rpc('wallet_update_and_record', {
    p_company_id: parsed.companyId,
    p_op: 'TOPUP',
    p_amount: amount,
    p_reference: `razorpay_topup:${opts.orderId}`,
    p_created_by: null,
  });

  if (topupErr) {
    throw new Error(topupErr.message);
  }

  const txRow = Array.isArray(topupData) ? (topupData as any[])[0] : (topupData as any);

  return {
    alreadyProcessed: false,
    companyId: parsed.companyId,
    amount,
    wallet_tx_id: txRow?.id ?? null,
    balance_after: txRow?.balance_after ?? null,
  };
}
