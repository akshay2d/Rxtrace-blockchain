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
      .select('id, discount_type, discount_value, discount_applies_to, razorpay_subscription_id, trial_end_date, razorpay_offer_id')
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

    // Fetch plan (id + base_price) for validation and company_subscriptions.plan_id
    const planNameForDb = requestedPlan.charAt(0).toUpperCase() + requestedPlan.slice(1);
    const { data: planRow } = await supabase
      .from('subscription_plans')
      .select('id, base_price')
      .eq('name', planNameForDb)
      .eq('billing_cycle', billingCycleDb)
      .eq('is_active', true)
      .maybeSingle();

    const basePlanPrice = Number(planRow?.base_price ?? 0);
    const planIdDb = (planRow as any)?.id as string | undefined;
    if (basePlanPrice <= 0 || !planIdDb) {
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

    // Blocker 2: Resolve exactly ONE offer_id (coupon OR company). Gateway applies discount; never send discount as addon.
    let offerId: string | null = null;
    let couponDiscountId: string | null = null;
    const couponCode = typeof body?.coupon_code === 'string' ? body.coupon_code.trim() : null;
    if (couponCode) {
      const { data: couponRow } = await supabase
        .from('discounts')
        .select('id, code, type, value, valid_from, valid_to, usage_limit, usage_count, is_active, razorpay_offer_id')
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
          couponDiscountId = (couponRow as any).id;
          const rpOffer = (couponRow as any).razorpay_offer_id;
          if (rpOffer && String(rpOffer).trim()) offerId = String(rpOffer).trim();
        }
      }
    }
    if (!offerId && discount.discount_type && discount.discount_value !== null) {
      const applies = discount.discount_applies_to === 'subscription' || discount.discount_applies_to === 'both';
      if (applies) {
        const companyOffer = (company as any)?.razorpay_offer_id;
        if (companyOffer && String(companyOffer).trim()) offerId = String(companyOffer).trim();
      }
    }

    // Addons: GST only. Never send discount/coupon as addon (Blocker 2).
    const subtotalForTax = finalCalc.amountAfterDiscount; // preview only; gateway is authority when offer_id used
    const taxAfterCoupon = finalCalc.hasGST ? Number((subtotalForTax * 0.18).toFixed(2)) : 0;
    const addons: Array<{ item: { name: string; amount: number; currency: string } }> = [];
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
        ...(offerId ? { offer_id: offerId } : {}),
        ...(addons.length > 0 ? { addons } : {}),
        notes: {
          company_id: companyId,
          plan: requestedPlan,
          billing_cycle: billingCycleDb,
          source: 'billing_upgrade',
          has_discount: String(!!offerId),
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

      // Blocker 1: Persist paid subscription to company_subscriptions and set company to active.
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + (isAnnual ? 12 : 1));
      const nowIso = new Date().toISOString();
      const { data: existingSub } = await supabase
        .from('company_subscriptions')
        .select('id')
        .eq('company_id', companyId)
        .maybeSingle();

      if (existingSub?.id) {
        const { error: updateSubErr } = await supabase
          .from('company_subscriptions')
          .update({
            plan_id: planIdDb,
            status: 'ACTIVE',
            razorpay_subscription_id: subscriptionId,
            is_trial: false,
            current_period_end: periodEnd.toISOString(),
            updated_at: nowIso,
          })
          .eq('company_id', companyId);
        if (updateSubErr) {
          console.error('Upgrade: failed to update company_subscriptions', updateSubErr);
          return NextResponse.json({
            error: 'Subscription created in payment gateway but failed to update subscription record. Please contact support.',
            details: updateSubErr.message,
          }, { status: 500 });
        }
      } else {
        const { error: insertSubErr } = await supabase
          .from('company_subscriptions')
          .insert({
            company_id: companyId,
            plan_id: planIdDb,
            status: 'ACTIVE',
            razorpay_subscription_id: subscriptionId,
            is_trial: false,
            current_period_end: periodEnd.toISOString(),
            created_at: nowIso,
            updated_at: nowIso,
          });
        if (insertSubErr) {
          console.error('Upgrade: failed to insert company_subscriptions', insertSubErr);
          return NextResponse.json({
            error: 'Subscription created in payment gateway but failed to create subscription record. Please contact support.',
            details: insertSubErr.message,
          }, { status: 500 });
        }
      }

      const { error: companyUpdateErr } = await supabase
        .from('companies')
        .update({
          subscription_plan: requestedPlan,
          razorpay_subscription_id: subscription?.id ?? subscriptionId,
          razorpay_plan_id: subscription?.plan_id ?? planId,
          razorpay_subscription_status: subscription?.status ?? 'active',
          subscription_status: 'active',
          subscription_updated_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', companyId);
      if (companyUpdateErr) {
        console.error('Upgrade: failed to update company', companyUpdateErr);
        return NextResponse.json({
          error: 'Subscription created in payment gateway but failed to update company. Please contact support.',
          details: companyUpdateErr.message,
        }, { status: 500 });
      }
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
          has_discount: String(!!offerId),
          has_tax: String(finalCalc.hasGST),
          ...discountMetadata,
        } as Record<string, string | number | null>,
      });

      const { error: companyUpdateErr } = await supabase
        .from('companies')
        .update({
          subscription_plan: requestedPlan,
          razorpay_subscription_id: subscription?.id ?? subscriptionId,
          razorpay_plan_id: subscription?.plan_id ?? planId,
          razorpay_subscription_status: subscription?.status ?? null,
          subscription_status: 'active',
          subscription_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', companyId);
      if (companyUpdateErr) {
        return NextResponse.json({ error: companyUpdateErr.message }, { status: 500 });
      }

      // Update company_subscriptions for existing paid subscription (e.g. plan change)
      const { data: existingSub } = await supabase
        .from('company_subscriptions')
        .select('id')
        .eq('company_id', companyId)
        .maybeSingle();
      if (existingSub?.id) {
        await supabase
          .from('company_subscriptions')
          .update({
            plan_id: planIdDb,
            status: 'ACTIVE',
            razorpay_subscription_id: subscription?.id ?? subscriptionId,
            updated_at: new Date().toISOString(),
          })
          .eq('company_id', companyId);
      }
    }

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
