import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createRazorpayClient, razorpaySubscriptionPlanIdFor } from '@/lib/razorpay/server';
import { calculateFinalAmount } from '@/lib/billing/tax';
import { resolveCompanyForUser } from '@/lib/company/resolve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeCycleForDb(raw: unknown): 'monthly' | 'yearly' | 'quarterly' {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'yearly' || v === 'annual' || v === 'year') return 'yearly';
  if (v === 'quarterly' || v === 'quarter') return 'quarterly';
  return 'monthly';
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
    let resolved = await resolveCompanyForUser(
      supabase,
      user.id,
      'id, user_id, discount_type, discount_value, discount_applies_to, razorpay_subscription_id, razorpay_offer_id, gst'
    );

    // Production: subscription must always redirect to payment. If no company, create minimal company so we never block.
    if (!resolved) {
      const companyName = (user.user_metadata?.full_name as string)?.trim() || (user.email?.split('@')[0]) || 'My Company';
      const nowIso = new Date().toISOString();
      const { data: newCompany, error: createErr } = await supabase
        .from('companies')
        .insert({
          user_id: user.id,
          company_name: companyName,
          profile_completed: false,
          firm_type: 'proprietorship',
          business_type: 'distributor',
          business_category: 'pharma',
          phone: '',
          address: '',
          email: user.email ?? null,
          updated_at: nowIso,
        })
        .select('id, user_id, discount_type, discount_value, discount_applies_to, razorpay_subscription_id, razorpay_offer_id, gst')
        .single();
      if (createErr || !newCompany?.id) {
        console.error('Upgrade: failed to create minimal company', createErr);
        return NextResponse.json({ error: 'Could not create company for subscription. Please complete company setup first.' }, { status: 500 });
      }
      resolved = {
        companyId: newCompany.id,
        company: newCompany as Record<string, unknown>,
        isOwner: true,
      };
    }

    const companyId = resolved.companyId;
    const company = resolved.company as Record<string, unknown>;
    let subscriptionId = company?.razorpay_subscription_id as string | undefined;

    // Fetch valid paid plan IDs from DB (subscription_plans.razorpay_plan_id). Env can contain trial plan—DB is source of truth.
    const { data: validPlanRows } = await supabase
      .from('subscription_plans')
      .select('razorpay_plan_id')
      .not('razorpay_plan_id', 'is', null);
    const validIdsFromDb = new Set(
      (validPlanRows ?? [])
        .map((r: any) => r?.razorpay_plan_id)
        .filter(Boolean)
        .map((s: string) => String(s).trim())
    );
    // Use DB only; when empty, never reuse (avoids env containing trial plan ID)
    const validPaidPlanIds = validIdsFromDb;

    // Only reuse existing razorpay_subscription_id if (a) company has paid subscription AND
    // (b) the Razorpay subscription uses one of our 6 paid plans. Old trial (₹5) plan must not be reused.
    if (subscriptionId) {
      const { data: paidSub } = await supabase
        .from('company_subscriptions')
        .select('id')
        .eq('company_id', companyId)
        .in('status', ['active', 'ACTIVE', 'paused', 'PAUSED'])
        .maybeSingle();
      if (!paidSub) {
        subscriptionId = undefined;
      } else {
        const razorpay = createRazorpayClient();
        try {
          const existing = await (razorpay.subscriptions as any).fetch(subscriptionId);
          const existingPlanId = (existing as any)?.plan_id;
          if (!existingPlanId || !validPaidPlanIds.has(String(existingPlanId).trim())) {
            subscriptionId = undefined;
          }
        } catch {
          subscriptionId = undefined;
        }
      }
    }

    // Fetch plan (id + base_price) for validation and company_subscriptions.plan_id
    // Map tier+cycle to fixed plan names: Starter Monthly, Starter Yearly, Growth Monthly, Growth Yearly
    const tier = requestedPlan.trim().toLowerCase();
    const cycle = billingCycleDb;
    const planNameMap: Record<string, string> = {
      'starter_monthly': 'Starter Monthly',
      'starter_yearly': 'Starter Yearly',
      'growth_monthly': 'Growth Monthly',
      'growth_yearly': 'Growth Yearly',
      // Enterprise plans removed
    };
    const planNameForDb = planNameMap[`${tier}_${cycle}`] ?? null;
    if (!planNameForDb) {
      return NextResponse.json(
        { error: `Plan "${requestedPlan}" with cycle "${cycle}" not supported. Use Starter Monthly/Yearly, Growth Monthly/Yearly.` },
        { status: 400 }
      );
    }
    const { data: planRow } = await supabase
      .from('subscription_plans')
      .select('id, base_price, razorpay_plan_id')
      .eq('name', planNameForDb)
      .eq('billing_cycle', billingCycleDb)
      .maybeSingle();

    const basePlanPrice = Number(planRow?.base_price ?? 0);
    const planIdDb = (planRow as any)?.id as string | undefined;
    const razorpayPlanIdFromDb = (planRow as any)?.razorpay_plan_id as string | null | undefined;
    if (basePlanPrice <= 0 || !planIdDb) {
      return NextResponse.json(
        { error: `Plan "${requestedPlan}" with cycle "${billingCycleDb}" not found or inactive` },
        { status: 404 }
      );
    }

    // Prefer razorpay_plan_id from DB (set via Admin sync); fallback to env. Avoids ₹5 trial plan when env is wrong.
    const planIdForRazorpay = (razorpayPlanIdFromDb && String(razorpayPlanIdFromDb).trim())
      ? String(razorpayPlanIdFromDb).trim()
      : planId;

    const discount = {
      discount_type: company?.discount_type as 'percentage' | 'flat' | null,
      discount_value: company?.discount_value as number | null,
      discount_applies_to: company?.discount_applies_to as 'subscription' | 'addon' | 'both' | null,
    };

    const gstNumber = company?.gst ?? (company as any)?.gst_number ?? null;
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
        const companyOffer = company?.razorpay_offer_id;
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

    if (!subscriptionId) {
      const startAtSeconds = Math.floor((Date.now() + 60_000) / 1000);

      subscription = await razorpay.subscriptions.create({
        plan_id: planIdForRazorpay,
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

      // Blocker 1: Persist paid subscription to company_subscriptions (upsert: insert or update on company_id).
      const periodEnd = new Date();
      const monthsToAdd = billingCycleDb === 'yearly' ? 12 : 1;
      periodEnd.setMonth(periodEnd.getMonth() + monthsToAdd);
      const nowIso = new Date().toISOString();
      const planCode = planNameForDb.toLowerCase().replace(/\s+/g, '_');
      const subRow: Record<string, unknown> = {
        company_id: companyId,
        plan_id: planIdDb,
        plan_code: planCode,
        billing_cycle: billingCycleDb,
        status: 'active',
        razorpay_subscription_id: subscriptionId,
        current_period_end: periodEnd.toISOString(),
        is_trial: false,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const { error: upsertErr } = await supabase
        .from('company_subscriptions')
        .upsert(subRow, { onConflict: 'company_id', ignoreDuplicates: false });

      if (upsertErr) {
        console.error('Upgrade: failed to upsert company_subscriptions', upsertErr);
        return NextResponse.json({
          error: 'Subscription created in payment gateway but failed to create subscription record. Please contact support.',
          details: upsertErr.message,
        }, { status: 500 });
      }

      const { error: companyUpdateErr } = await supabase
        .from('companies')
        .update({
          subscription_plan: requestedPlan,
          razorpay_subscription_id: subscription?.id ?? subscriptionId,
          razorpay_plan_id: subscription?.plan_id ?? planIdForRazorpay,
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
        plan_id: planIdForRazorpay,
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
          subscription_plan: planNameForDb,
          razorpay_subscription_id: subscription?.id ?? subscriptionId,
          razorpay_plan_id: subscription?.plan_id ?? planIdForRazorpay,
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
        const planCode = planNameForDb.toLowerCase().replace(/\s+/g, '_');
        await supabase
          .from('company_subscriptions')
          .update({
            plan_id: planIdDb,
            plan_code: planCode,
            billing_cycle: billingCycleDb,
            status: 'active',
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
