import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveCompanyForUser } from '@/lib/company/resolve';
import { calculateFinalAmount } from '@/lib/billing/tax';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeCycle(raw: unknown): 'monthly' | 'yearly' {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === 'yearly' || v === 'annual' || v === 'year' ? 'yearly' : 'monthly';
}

/**
 * POST /api/billing/calculate-amount
 * Body: { plan: string, billing_cycle: string, coupon_code?: string }
 * Returns calculated subscription amount breakdown (no subscription created).
 * Used for pricing page preview so UI matches Razorpay and invoice.
 */
export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const requestedPlan = typeof body?.plan === 'string' ? body.plan.trim().toLowerCase() : null;
    if (!requestedPlan) {
      return NextResponse.json({ success: false, error: 'plan is required' }, { status: 400 });
    }
    const billingCycle = normalizeCycle(body?.billing_cycle ?? body?.billing_cycle_raw);
    const couponCode = typeof body?.coupon_code === 'string' ? body.coupon_code.trim() : null;

    const admin = getSupabaseAdmin();
    const resolved = await resolveCompanyForUser(
      admin,
      user.id,
      'id, discount_type, discount_value, discount_applies_to, gst'
    );
    if (!resolved) {
      return NextResponse.json({ success: false, error: 'Company not found' }, { status: 404 });
    }
    const companyId = resolved.companyId;
    const company = resolved.company;

    const planNameForDb = requestedPlan.charAt(0).toUpperCase() + requestedPlan.slice(1);
    const { data: planRow } = await admin
      .from('subscription_plans')
      .select('base_price')
      .eq('name', planNameForDb)
      .eq('billing_cycle', billingCycle)
      .eq('is_active', true)
      .maybeSingle();

    const basePrice = Number(planRow?.base_price ?? 0);
    if (basePrice <= 0) {
      return NextResponse.json(
        { success: false, error: `Plan "${requestedPlan}" with cycle "${billingCycle}" not found or inactive` },
        { status: 404 }
      );
    }

    const discount = {
      type: company?.discount_type as 'percentage' | 'flat' | null,
      value: company?.discount_value as number | null,
      appliesTo: company?.discount_applies_to as 'subscription' | 'addon' | 'both' | null,
    };
    const gstNumber = company?.gst ?? (company as any)?.gst_number ?? null;

    const finalCalc = calculateFinalAmount({
      basePrice,
      discount: discount.type && discount.value !== null
        ? { type: discount.type, value: discount.value, appliesTo: discount.appliesTo }
        : null,
      gstNumber: gstNumber && String(gstNumber).trim() ? String(gstNumber).trim() : null,
      itemType: 'subscription',
    });

    let couponDiscountInr = 0;
    if (couponCode) {
      const { data: couponRow } = await admin
        .from('discounts')
        .select('id, code, type, value, valid_from, valid_to, usage_limit, usage_count, is_active')
        .ilike('code', couponCode.toLowerCase())
        .eq('is_active', true)
        .maybeSingle();
      if (couponRow) {
        const now = new Date();
        const vFrom = new Date((couponRow as any).valid_from);
        const vTo = (couponRow as any).valid_to ? new Date((couponRow as any).valid_to) : null;
        const limit = (couponRow as any).usage_limit;
        const used = (couponRow as any).usage_count ?? 0;
        const { data: assign } = await admin
          .from('company_discounts')
          .select('id')
          .eq('company_id', companyId)
          .eq('discount_id', (couponRow as any).id)
          .maybeSingle();
        if (vFrom <= now && (!vTo || vTo >= now) && (limit == null || used < limit) && assign) {
          const amt = finalCalc.amountAfterDiscount;
          const typ = (couponRow as any).type;
          const val = Number((couponRow as any).value ?? 0);
          couponDiscountInr = typ === 'percentage' ? Math.min(amt * (val / 100), amt) : Math.min(val, amt);
        }
      }
    }

    const subtotalAfterCoupon = Math.max(0, finalCalc.amountAfterDiscount - couponDiscountInr);
    const taxAfterCoupon = finalCalc.hasGST ? Number((subtotalAfterCoupon * 0.18).toFixed(2)) : 0;
    const finalAmount = Number((subtotalAfterCoupon + taxAfterCoupon).toFixed(2));

    return NextResponse.json({
      success: true,
      plan: requestedPlan,
      billing_cycle: billingCycle,
      basePrice,
      discountAmount: finalCalc.discountAmount,
      amountAfterDiscount: finalCalc.amountAfterDiscount,
      couponDiscountAmount: Number(couponDiscountInr.toFixed(2)),
      subtotalAfterCoupon,
      taxAmount: taxAfterCoupon,
      finalAmount,
      hasGST: finalCalc.hasGST,
      breakdown: {
        base: basePrice,
        discount: finalCalc.discountAmount,
        subtotalAfterDiscount: finalCalc.amountAfterDiscount,
        coupon: Number(couponDiscountInr.toFixed(2)),
        subtotalAfterCoupon,
        tax: taxAfterCoupon,
        total: finalAmount,
      },
    });
  } catch (e: any) {
    console.error('calculate-amount error:', e);
    return NextResponse.json(
      { success: false, error: e?.message ?? 'Calculation failed' },
      { status: 500 }
    );
  }
}
