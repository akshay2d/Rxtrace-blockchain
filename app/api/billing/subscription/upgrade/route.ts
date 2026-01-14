import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createRazorpayClient, razorpaySubscriptionPlanIdFor } from '@/lib/razorpay/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const {
      data: { user },
      error: authErr,
    } = await supabaseServer().auth.getUser();

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const requestedPlan = typeof body?.plan === 'string' ? body.plan : null;
    if (!requestedPlan) {
      return NextResponse.json({ error: 'plan is required' }, { status: 400 });
    }

    let planId: string;
    try {
      planId = razorpaySubscriptionPlanIdFor(requestedPlan);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      // Treat missing env / invalid plan as a user-actionable request issue.
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('*')
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

    const razorpay = createRazorpayClient();
    let subscription: any;

    // Calculate appropriate total_count based on billing cycle
    // Razorpay limits: max 100 for annual, 120 works for monthly/quarterly
    const isAnnual = requestedPlan.includes('annual');
    const totalCount = isAnnual ? 100 : 120;

    // If no subscription exists, create one
    if (!subscriptionId) {
      const trialEnd = (company as any).trial_end_date ? new Date(String((company as any).trial_end_date)) : null;
      const startAtSeconds = Math.floor(((trialEnd && trialEnd.getTime() > Date.now()) ? trialEnd : new Date(Date.now() + 60_000)).getTime() / 1000);

      subscription = await razorpay.subscriptions.create({
        plan_id: planId,
        total_count: totalCount,
        customer_notify: 1,
        start_at: startAtSeconds,
        notes: {
          company_id: companyId,
          plan: requestedPlan,
          source: 'billing_upgrade',
        },
      });

      subscriptionId = subscription.id;
    } else {
      // Update existing subscription
      subscription = await (razorpay.subscriptions as any).update(subscriptionId, {
        plan_id: planId,
        schedule_change_at: 'now',
        notes: {
          source: 'billing_upgrade',
          plan: requestedPlan,
          company_id: companyId,
        },
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
