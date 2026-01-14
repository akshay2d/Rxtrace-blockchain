import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { normalizePlanType } from '@/lib/billing/period';
import { createRazorpayClient, razorpaySubscriptionPlanIdFor } from '@/lib/razorpay/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function secondsFromDate(d: Date) {
  return Math.floor(d.getTime() / 1000);
}

export async function POST(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const provided = req.headers.get('x-cron-secret');
    if (!secret) {
      return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET is not set' }, { status: 500 });
    }

    if (!provided || provided !== secret) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();
    const now = new Date();
    const razorpay = createRazorpayClient();

    // Find trials that ended
    const { data: companies, error: companiesErr } = await supabase
      .from('companies')
      .select('id, subscription_plan, subscription_status, trial_end_date, extra_user_seats, extra_erp_integrations')
      .eq('subscription_status', 'trial')
      .not('trial_end_date', 'is', null)
      .lte('trial_end_date', now.toISOString())
      .limit(200);

    if (companiesErr) {
      return NextResponse.json({ error: companiesErr.message }, { status: 500 });
    }

    const results: Array<any> = [];

    for (const company of companies ?? []) {
      const companyId = (company as any).id as string;
      const plan = ((company as any).subscription_plan ?? 'starter') as string;
      const trialEnd = new Date((company as any).trial_end_date as string);
      const normalizedPlan = normalizePlanType(plan) ?? 'starter';

      try {
        // Ensure Razorpay subscription exists (created during trial activation; fallback here)
        let subscriptionId = (company as any).razorpay_subscription_id as string | null;
        let subscription: any = null;

        if (!subscriptionId) {
          const planId = razorpaySubscriptionPlanIdFor(normalizedPlan);
          const startAtSeconds = secondsFromDate(new Date(Math.max(Date.now() + 60_000, trialEnd.getTime())));

          subscription = await (razorpay.subscriptions as any).create({
            plan_id: planId,
            total_count: 120,
            customer_notify: 1,
            start_at: startAtSeconds,
            notes: { company_id: companyId, plan: normalizedPlan, source: 'cron_post_trial' },
          });
          subscriptionId = subscription?.id ?? null;

          await supabase
            .from('companies')
            .update({
              razorpay_subscription_id: subscriptionId,
              razorpay_subscription_status: subscription?.status ?? 'created',
              razorpay_plan_id: subscription?.plan_id ?? planId,
              subscription_updated_at: now.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq('id', companyId);
        }

        if (subscriptionId && !subscription) {
          subscription = await (razorpay.subscriptions as any).fetch(subscriptionId);
        }

        const providerStatus = String(subscription?.status ?? (company as any).razorpay_subscription_status ?? '').toLowerCase();
        const isActive = providerStatus === 'active';

        await supabase
          .from('companies')
          .update({
            subscription_status: isActive ? 'active' : 'past_due',
            razorpay_subscription_status: subscription?.status ?? (company as any).razorpay_subscription_status ?? null,
            subscription_current_period_end:
              typeof subscription?.current_end === 'number'
                ? new Date(subscription.current_end * 1000).toISOString()
                : (company as any).subscription_current_period_end ?? null,
            subscription_updated_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq('id', companyId);

        results.push({ company_id: companyId, status: isActive ? 'active' : 'past_due', razorpay_subscription_id: subscriptionId, razorpay_status: subscription?.status ?? null });
      } catch (e: any) {
        results.push({ company_id: companyId, status: 'error', error: e?.message ?? String(e) });
      }
    }

    return NextResponse.json({ ok: true, now: now.toISOString(), processed: results.length, results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
