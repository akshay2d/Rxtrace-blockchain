import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createRazorpayClient } from '@/lib/razorpay/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const atPeriodEnd = body?.at_period_end !== false; // default true

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
    const subscriptionId = (company as any)?.razorpay_subscription_id as string | undefined;

    if (!companyId) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    if (!subscriptionId) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const razorpay = createRazorpayClient();

    // Razorpay SDK typings vary; use `any` to avoid build-time friction.
    const cancelled: any = await (razorpay.subscriptions as any).cancel(
      subscriptionId,
      atPeriodEnd ? { cancel_at_cycle_end: 1 } : undefined
    );

    await supabase
      .from('companies')
      .update({
        razorpay_subscription_status: cancelled?.status ?? 'cancelled',
        subscription_cancel_at_period_end: atPeriodEnd,
        subscription_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', companyId);

    return NextResponse.json({ ok: true, status: cancelled?.status ?? null });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
