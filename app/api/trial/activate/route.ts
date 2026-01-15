import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { createClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';
import { PRICING } from '@/lib/billingConfig';
import { normalizePlanType, quotasForPlan } from '@/lib/billing/period';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getRazorpayKeys() {
  const keyId = process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('Razorpay not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)');
  }
  return { keyId, keySecret };
}

function razorpayPlanIdFor(plan: string): string {
  const normalized = normalizePlanType(plan);
  if (!normalized) throw new Error('Invalid plan');

  // Provide these in your env. Example:
  // RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_MONTHLY=plan_XXXX
  // RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY=plan_YYYY
  const map: Record<string, string | undefined> = {
    starter: process.env.RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_MONTHLY,
    growth: process.env.RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY,
    enterprise: process.env.RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_MONTHLY,
  };

  const planId = map[normalized];
  if (!planId) {
    throw new Error(`Missing Razorpay plan id env for ${normalized}`);
  }
  return planId;
}

export async function POST(req: NextRequest) {
  try {
    const { payment_id, order_id, signature, company_id, plan } = await req.json();

    if (!payment_id || !order_id || !company_id || !plan) {
      return NextResponse.json(
        { error: 'company_id, plan, payment_id and order_id are required' },
        { status: 400 }
      );
    }

    const allowedPlans = new Set(['starter', 'growth']);
    if (typeof plan !== 'string' || !allowedPlans.has(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Verify Razorpay payment signature
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    
    if (!razorpayKeySecret) {
      console.error('Razorpay key secret not configured');
      return NextResponse.json(
        { error: 'Payment gateway not configured' },
        { status: 500 }
      );
    }

    // Verify signature if provided
    if (!signature) {
      return NextResponse.json({ error: 'Payment signature is required' }, { status: 400 });
    }

    const expectedSignature = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(`${order_id}|${payment_id}`)
      .digest('hex');

    if (expectedSignature !== signature) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 401 });
    }

    const {
      data: { user },
      error: authErr,
    } = await (await supabaseServer()).auth.getUser();

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current user from payment context
    const { data: orderRecord } = await supabase
      .from('razorpay_orders')
      .select('*')
      .eq('order_id', order_id)
      .single();

    if (!orderRecord) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Update order status
    await supabase
      .from('razorpay_orders')
      .update({
        payment_id,
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq('order_id', order_id);

    // Resolve company and ensure it belongs to the authenticated user
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('*')
      .eq('id', company_id)
      .eq('user_id', user.id)
      .single();

    if (companyErr) {
      return NextResponse.json({ error: companyErr.message }, { status: 500 });
    }

    if (!company) {
      return NextResponse.json(
        { error: 'No company found for trial activation' },
        { status: 404 }
      );
    }

    // Calculate trial end date (15 days from now)
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 15);

    const planType = normalizePlanType(plan);
    if (!planType) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const quotas = quotasForPlan(planType);
    const planKey = planType;

    // Create Razorpay subscription that will start charging after trial ends.
    // This enables auto-renewal once the customer authorizes the subscription.
    let subscription: any = null;
    try {
      const { keyId, keySecret } = getRazorpayKeys();
      const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

      const planId = razorpayPlanIdFor(planKey);
      const startAt = Math.floor(trialEndDate.getTime() / 1000);

      // Razorpay limits: max 100 for annual plans
      const totalCount = 120; // Monthly plans only during trial

      subscription = await razorpay.subscriptions.create({
        plan_id: planId,
        total_count: totalCount,
        customer_notify: 1,
        start_at: startAt,
        notes: {
          company_id: company_id,
          plan: planKey,
          source: 'trial_activate',
        },
      });
    } catch (e: any) {
      // Trial can still be activated; subscription can be created later from Billing page.
      console.error('Failed to create Razorpay subscription:', e);
    }

    // Update company with trial status
    const { error: companyUpdateError } = await supabase
      .from('companies')
      .update({
        subscription_status: 'trial',
        trial_start_date: new Date().toISOString(),
        trial_end_date: trialEndDate.toISOString(),
        subscription_plan: planKey,
        ...(subscription?.id
          ? {
              razorpay_subscription_id: subscription.id,
              razorpay_subscription_status: subscription.status ?? 'created',
              razorpay_plan_id: (subscription as any).plan_id ?? null,
              subscription_updated_at: new Date().toISOString(),
            }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', company.id);

    if (companyUpdateError) {
      console.error('Failed to update company:', companyUpdateError);
      return NextResponse.json(
        { error: 'Failed to activate trial' },
        { status: 500 }
      );
    }

    // Initialize billing quotas for the trial period
    const { error: billingError } = await supabase
      .from('billing_usage')
      .insert({
        company_id: company.id,
        billing_period_start: new Date().toISOString(),
        billing_period_end: trialEndDate.toISOString(),
        plan: planKey,
        
        // Quotas
        unit_labels_quota: quotas.unit_labels_quota,
        box_labels_quota: quotas.box_labels_quota,
        carton_labels_quota: quotas.carton_labels_quota,
        pallet_labels_quota: quotas.pallet_labels_quota,
        user_seats_quota: quotas.user_seats_quota,
        
        // Usage (initialized to 0)
        unit_labels_used: 0,
        box_labels_used: 0,
        carton_labels_used: 0,
        pallet_labels_used: 0,
        user_seats_used: quotas.user_seats_quota,
        
        created_at: new Date().toISOString(),
      });

    if (billingError) {
      console.error('Failed to create billing usage:', billingError);
      // Continue - trial activated, billing can be fixed later
    }

    // Log activation event in audit table
    try {
      await supabase
        .from('audit_logs')
        .insert({
          company_id: company.id,
          actor: company.user_id || 'system',
          action: 'trial_activated',
          status: 'success',
          integration_system: 'razorpay',
          metadata: {
            payment_id,
            order_id,
            trial_end_date: trialEndDate.toISOString(),
            plan: 'starter',
            company_name: company.company_name,
            description: `15-day free trial activated for ${company.company_name}`,
          },
        });
    } catch (auditError) {
      console.error('Failed to log audit event:', auditError);
      // Continue - trial activated successfully
    }

    return NextResponse.json({
      success: true,
      message: 'Trial activated successfully',
      company: {
        id: company.id,
        name: company.company_name,
        subscription_status: 'trial',
        trial_end_date: trialEndDate.toISOString(),
        plan: planKey,
      },
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status ?? null,
            short_url: (subscription as any).short_url ?? null,
          }
        : null,
      quotas: {
        unit_labels: quotas.unit_labels_quota,
        box_labels: quotas.box_labels_quota,
        carton_labels: quotas.carton_labels_quota,
        pallet_labels: quotas.pallet_labels_quota,
        user_seats: quotas.user_seats_quota,
      },
    });
  } catch (error: any) {
    console.error('Trial activation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to activate trial' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  );
}
