import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  createRazorpayClient,
  razorpaySubscriptionPlanIdFor,
  getRazorpayKeys,
  razorpaySubscriptionPlanAvailability,
} from '@/lib/razorpay/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const {
      data: { user },
      error: authErr,
    } = await supabaseServer().auth.getUser();

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    const { data: company, error: companyErr } = await supabase
      .from('companies')
      // Use '*' so this endpoint doesn't hard-fail if some optional columns
      // (e.g. razorpay_subscription_id) haven't been migrated yet.
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (companyErr) {
      return NextResponse.json({ error: companyErr.message }, { status: 500 });
    }
    if (!company || !(company as any)?.id) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const keyId = process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    const planAvailability = razorpaySubscriptionPlanAvailability();

    return NextResponse.json({
      company,
      razorpay: {
        configured: Boolean(keyId && keySecret),
        planAvailability,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Optional: create subscription if missing (e.g., if trial activation couldn't create it)
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

    const supabase = getSupabaseAdmin();
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      // Use '*' so this endpoint doesn't hard-fail if some optional columns
      // (e.g. razorpay_subscription_id) haven't been migrated yet.
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (companyErr) {
      return NextResponse.json({ error: companyErr.message }, { status: 500 });
    }
    if (!company || !(company as any)?.id) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    if ((company as any).razorpay_subscription_id) {
      return NextResponse.json({ ok: true, subscription_id: (company as any).razorpay_subscription_id });
    }

    const planKey = requestedPlan ?? String((company as any).subscription_plan ?? 'starter');
    let planId: string;
    try {
      planId = razorpaySubscriptionPlanIdFor(planKey);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const trialEnd = (company as any).trial_end_date ? new Date(String((company as any).trial_end_date)) : null;
    const startAtSeconds = Math.floor(((trialEnd && trialEnd.getTime() > Date.now()) ? trialEnd : new Date(Date.now() + 60_000)).getTime() / 1000);

    // Razorpay limits: max 100 for annual plans, 120 for monthly/quarterly
    const isAnnual = planKey.includes('annual');
    const totalCount = isAnnual ? 100 : 120;

    const razorpay = createRazorpayClient();
    const subscription: any = await razorpay.subscriptions.create({
      plan_id: planId,
      total_count: totalCount,
      customer_notify: 1,
      start_at: startAtSeconds,
      notes: {
        company_id: company.id,
        plan: planKey,
        source: 'billing_page',
      },
    });

    await supabase
      .from('companies')
      .update({
        razorpay_subscription_id: subscription.id,
        razorpay_subscription_status: subscription.status ?? 'created',
        razorpay_plan_id: (subscription as any).plan_id ?? null,
        subscription_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', company.id);

    const { keyId } = getRazorpayKeys();

    return NextResponse.json({
      ok: true,
      keyId,
      subscription: {
        id: subscription.id,
        status: subscription.status ?? null,
        short_url: (subscription as any).short_url ?? null,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
