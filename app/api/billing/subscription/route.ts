import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveCompanyForUser } from '@/lib/company/resolve';
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
    } = await (await supabaseServer()).auth.getUser();

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const resolved = await resolveCompanyForUser(supabase, user.id, '*');

    if (!resolved || !(resolved.company as any)?.id) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const company = resolved.company as Record<string, unknown>;

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
    } = await (await supabaseServer()).auth.getUser();

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const requestedPlan = typeof body?.plan === 'string' ? body.plan : null;

    const supabase = getSupabaseAdmin();
    const resolved = await resolveCompanyForUser(supabase, user.id, '*');
    if (!resolved) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    const company = resolved.company as Record<string, unknown>;

    if (company.razorpay_subscription_id) {
      return NextResponse.json({ ok: true, subscription_id: company.razorpay_subscription_id });
    }

    const planKey = requestedPlan ?? String(company.subscription_plan ?? 'starter');
    let planId: string;
    try {
      planId = razorpaySubscriptionPlanIdFor(planKey);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const trialEnd = (company.trial_ends_at ?? (company as any).trial_end_date) ? new Date(String(company.trial_ends_at ?? (company as any).trial_end_date)) : null;
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
        company_id: resolved.companyId,
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
      .eq('id', resolved.companyId);

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
