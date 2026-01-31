import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createRazorpayClient, razorpaySubscriptionPlanIdFor } from '@/lib/razorpay/server';
import { calculateFinalAmount } from '@/lib/billing/tax';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeCycleForDb(raw: unknown): 'monthly' | 'yearly' {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === 'yearly' || v === 'annual' || v === 'year' ? 'yearly' : 'monthly';
}

export async function POST(req: Request) {
  try {
    const {
      data: { user },
      error: authErr,
    } = await (await supabaseServer()).auth.getUser();

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const requestedPlan = typeof body?.plan === 'string' ? body.plan : null;
    if (!requestedPlan) {
      return NextResponse.json({ error: 'plan is required' }, { status: 400 });
    }
    const billingCycleRaw = body?.billing_cycle ?? body?.billing_cycle_raw;
    const billingCycleDb = normalizeCycleForDb(billingCycleRaw);

    let planId: string;
    try {
      planId = razorpaySubscriptionPlanIdFor(requestedPlan, billingCycleRaw);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('id, discount_type, discount_value, discount_applies_to, razorpay_subscription_id, trial_end_date')
      .eq('user_id', user.id)
      .maybeSingle();

    if (companyErr) {
      return NextResponse.json({ error: companyErr.message }, { status: 500 });
    }

    const companyId = (company as any)?.id as string | undefined;
    let subscriptionId = (company as any)?.razorpay_subscription_id as string | undefined;

    if (!companyId) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Phase 4: Fetch base plan price from subscription_plans (by plan name + billing_cycle)
    const planNameForDb = requestedPlan.charAt(0).toUpperCase() + requestedPlan.slice(1);
    const { data: planRow } = await supabase
      .from('subscription_plans')
      .select('base_price')
      .eq('name', planNameForDb)
      .eq('billing_cycle', billingCycleDb)
      .eq('is_active', true)
      .maybeSingle();

    const basePlanPrice = Number(planRow?.base_price ?? 0);
    if (basePlanPrice <= 0) {
      return NextResponse.json(
        { error: `Plan "${requestedPlan}" with cycle "${billingCycleDb}" not found or inactive` },
        { status: 404 }
      );
    }

    const discount = {
      discount_type: (company as any)?.discount_type as 'percentage' | 'flat' | null,
      discount_value: (company as any)?.discount_value as number | null,
      discount_applies_to: (company as any)?.discount_applies_to as 'subscription' | 'addon' | 'both' | null,
    };

    const gstNumber = (company as any)?.gst ?? (company as any)?.gst_number ?? null;
    const finalCalc = calculateFinalAmount({
      basePrice: basePlanPrice,
      discount: discount.discount_type && discount.discount_value !== null
        ? { type: discount.discount_type, value: discount.discount_value, appliesTo: discount.discount_applies_to }
        : null,
      gstNumber: gstNumber && String(gstNumber).trim() ? String(gstNumber).trim() : null,
      itemType: 'subscription',
    });

    let couponDiscountInr = 0;
    let couponDiscountId: string | null = null;
    const couponCode = typeof body?.coupon_code === 'string' ? body.coupon_code.trim() : null;
    if (couponCode) {
      const { data: couponRow } = await supabase
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
        const { data: assign } = await supabase
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
          couponDiscountId = (couponRow as any).id;
        }
      }
    }

    const subtotalAfterCoupon = Math.max(0, finalCalc.amountAfterDiscount - couponDiscountInr);
    const taxAfterCoupon = finalCalc.hasGST ? Number((subtotalAfterCoupon * 0.18).toFixed(2)) : 0;

    const addons: Array<{ item: { name: string; amount: number; currency: string } }> = [];
    if (finalCalc.discountAmount > 0) {
      addons.push({
        item: {
          name: `Discount (${discount.discount_type === 'percentage' ? discount.discount_value + '%' : '₹' + discount.discount_value})`,
          amount: -Math.round(finalCalc.discountAmount * 100),
          currency: 'INR',
        },
      });
    }
    if (couponDiscountInr > 0 && couponDiscountId) {
      addons.push({
        item: {
          name: `Coupon (${couponCode})`,
          amount: -Math.round(couponDiscountInr * 100),
          currency: 'INR',
        },
      });
    }
    if (taxAfterCoupon > 0) {
      addons.push({
        item: {
          name: 'GST (18%)',
          amount: Math.round(taxAfterCoupon * 100),
          currency: 'INR',
        },
      });
    }

    const razorpay = createRazorpayClient();
    let subscription: any;

    const isAnnual = billingCycleDb === 'yearly';
    const totalCount = isAnnual ? 100 : 120;

    if (!subscriptionId) {
      const trialEnd = (company as any).trial_end_date ? new Date(String((company as any).trial_end_date)) : null;
      const startAtSeconds = Math.floor(((trialEnd && trialEnd.getTime() > Date.now()) ? trialEnd : new Date(Date.now() + 60_000)).getTime() / 1000);

      subscription = await razorpay.subscriptions.create({
        plan_id: planId,
        total_count: totalCount,
        customer_notify: 1,
        start_at: startAtSeconds,
        ...(addons.length > 0 ? { addons } : {}),
        notes: {
          company_id: companyId,
          plan: requestedPlan,
          billing_cycle: billingCycleDb,
          source: 'billing_upgrade',
          has_discount: String(finalCalc.discountAmount > 0),
          has_tax: String(finalCalc.hasGST),
          ...(couponDiscountId ? { coupon_id: couponDiscountId, coupon_code: couponCode ?? '' } : {}),
        } as Record<string, string>,
      });
      if (couponDiscountId) {
        const { data: d } = await supabase.from('discounts').select('usage_count').eq('id', couponDiscountId).single();
        await supabase.from('discounts').update({
          usage_count: ((d as any)?.usage_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        }).eq('id', couponDiscountId);
      }

      subscriptionId = subscription.id;
    } else {
      const discountMetadata = discount.discount_type && discount.discount_value !== null
        ? {
            discount_type: discount.discount_type,
            discount_value: discount.discount_value,
            discount_applies_to: discount.discount_applies_to,
          }
        : {};

      subscription = await (razorpay.subscriptions as any).update(subscriptionId, {
        plan_id: planId,
        schedule_change_at: 'now',
        notes: {
          source: 'billing_upgrade',
          plan: requestedPlan,
          billing_cycle: billingCycleDb,
          company_id: companyId,
          has_discount: String(finalCalc.discountAmount > 0),
          has_tax: String(finalCalc.hasGST),
          ...discountMetadata,
        } as Record<string, string | number | null>,
      });
    }

    await supabase
      .from('companies')
      .update({
        subscription_plan: requestedPlan,
        razorpay_subscription_id: subscription?.id ?? subscriptionId,
        razorpay_plan_id: subscription?.plan_id ?? planId,
        razorpay_subscription_status: subscription?.status ?? null,
        subscription_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', companyId);

    return NextResponse.json({
      ok: true,
      subscription: {
        id: subscription?.id ?? subscriptionId,
        status: subscription?.status ?? null,
        short_url: subscription?.short_url ?? null,
      },
    });
  } catch (err) {
    console.error('Upgrade error:', err);
    const msg = err instanceof Error ? err.message : (typeof err === 'object' && err !== null ? JSON.stringify(err) : String(err));
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
