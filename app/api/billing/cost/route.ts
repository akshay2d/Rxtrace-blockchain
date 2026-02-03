/**
 * GET /api/billing/cost
 * Server-side cost calculation. Source of truth: subscription_plans.base_price, add_ons.price.
 * Uses canonical company resolver (owner + seat). No frontend pricing constants.
 */

import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveCompanyForUser } from '@/lib/company/resolve';
import { ensureActiveBillingUsage } from '@/lib/billing/usage';
import { safeApiErrorMessage } from '@/lib/api-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const resolved = await resolveCompanyForUser(admin, user.id, 'id, gst');
    if (!resolved) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    const companyId = resolved.companyId;
    const company = resolved.company as Record<string, unknown>;

    const activeUsage = await ensureActiveBillingUsage({ supabase: admin, companyId }).catch(() => null);
    const usageRow = activeUsage as Record<string, unknown> | null;

    const handsetsCount = usageRow
      ? 0
      : toNum((await admin.from('handsets').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'ACTIVE')).count);
    const seatsCount = usageRow
      ? toNum(usageRow.user_seats_used)
      : toNum((await admin.from('seats').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('active', true)).count);
    const unitUsed = usageRow ? toNum(usageRow.unit_labels_used) : 0;
    const boxUsed = usageRow ? toNum(usageRow.box_labels_used) : 0;
    const cartonUsed = usageRow ? toNum(usageRow.carton_labels_used) : 0;
    const palletUsed = usageRow ? toNum(usageRow.pallet_labels_used) : 0;

    const { data: addOns } = await admin.from('add_ons').select('id, name, price, unit').eq('is_active', true);
    const addonsList = addOns ?? [];
    const priceByName = (name: string): number => {
      const n = name.toLowerCase();
      const a = addonsList.find((x: { name: string }) => x.name.toLowerCase().includes(n) || n.includes(x.name.toLowerCase()));
      return a ? toNum((a as { price: unknown }).price) : 0;
    };

    const handsetRate = priceByName('handset') || priceByName('device') || 0;
    const seatRate = priceByName('seat') || priceByName('user id') || 0;
    const boxRate = priceByName('box') || 0;
    const cartonRate = priceByName('carton') || 0;
    const palletRate = priceByName('pallet') || priceByName('sscc') || 0;

    const usage = {
      handsets: handsetsCount,
      seats: seatsCount,
      box_scans: boxUsed,
      carton_scans: cartonUsed,
      pallet_scans: palletUsed,
    };

    const lineItems: Array<{ label: string; count: number; rate: number; cost: number }> = [
      { label: 'Handsets (unlimited)', count: usage.handsets, rate: 0, cost: 0 },
      { label: 'Seats', count: usage.seats, rate: seatRate, cost: usage.seats * seatRate },
      { label: 'Box Scans', count: usage.box_scans, rate: boxRate, cost: usage.box_scans * boxRate },
      { label: 'Carton Scans', count: usage.carton_scans, rate: cartonRate, cost: usage.carton_scans * cartonRate },
      { label: 'Pallet Scans', count: usage.pallet_scans, rate: palletRate, cost: usage.pallet_scans * palletRate },
    ];

    let subtotal = lineItems.reduce((s, i) => s + i.cost, 0);

    const { data: subRow } = await admin
      .from('company_subscriptions')
      .select('plan_id, subscription_plans(base_price)')
      .eq('company_id', companyId)
      .in('status', ['active', 'ACTIVE', 'paused', 'PAUSED'])
      .maybeSingle();

    const planPrice = subRow?.subscription_plans
      ? toNum(Array.isArray(subRow.subscription_plans) ? (subRow.subscription_plans as { base_price: unknown }[])[0]?.base_price : (subRow.subscription_plans as { base_price: unknown })?.base_price)
      : 0;
    if (planPrice > 0) {
      lineItems.unshift({ label: 'Plan', count: 1, rate: planPrice, cost: planPrice });
      subtotal += planPrice;
    }

    const hasGst = Boolean(company?.gst && String(company.gst).trim());
    const taxRate = 0.18;
    const taxAmount = hasGst ? Number((subtotal * taxRate).toFixed(2)) : 0;
    const total = Number((subtotal + taxAmount).toFixed(2));

    const runningTotal = lineItems.reduce((s, i) => s + i.cost, 0);

    return NextResponse.json({
      success: true,
      usage: {
        ...usage,
        total: runningTotal,
      },
      line_items: lineItems,
      subtotal,
      discount_amount: 0,
      tax_amount: taxAmount,
      total,
      has_gst: hasGst,
    });
  } catch (err: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('billing/cost error:', err);
    }
    return NextResponse.json(
      { error: safeApiErrorMessage(err, 'Cost calculation failed') },
      { status: 500 }
    );
  }
}
