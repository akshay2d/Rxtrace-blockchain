import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

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

    const supabase = getSupabaseAdmin();
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (companyErr) {
      return NextResponse.json({ error: companyErr.message }, { status: 500 });
    }

    const companyId = (company as any)?.id as string | undefined;

    if (!companyId) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Get subscription from company_subscriptions (single source of truth)
    const { data: subscription, error: subError } = await supabase
      .from('company_subscriptions')
      .select('id, status, razorpay_subscription_id')
      .eq('company_id', companyId)
      .maybeSingle();

    if (subError) {
      return NextResponse.json({ error: subError.message }, { status: 500 });
    }

    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    // Only allow resuming CANCELLED or PAUSED subscriptions
    if (subscription.status !== 'CANCELLED' && subscription.status !== 'PAUSED') {
      return NextResponse.json({ 
        error: `Cannot resume subscription with status: ${subscription.status}` 
      }, { status: 400 });
    }

    // Handle TRIAL resume (no Razorpay subscription)
    if (!subscription.razorpay_subscription_id) {
      // For TRIAL, resume means reactivating the trial
      const { error: updateError } = await supabase
        .from('company_subscriptions')
        .update({
          status: 'TRIAL',
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, status: 'TRIAL' });
    }

    // Handle ACTIVE subscription resume (requires Razorpay)
    // Note: Razorpay doesn't have a direct "resume" API
    // We'll update the status to ACTIVE if it was paused
    const { error: updateError } = await supabase
      .from('company_subscriptions')
      .update({
        status: 'ACTIVE',
        updated_at: new Date().toISOString(),
      })
      .eq('id', subscription.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: 'ACTIVE' });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
