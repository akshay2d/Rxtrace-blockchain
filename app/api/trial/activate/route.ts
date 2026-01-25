import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { createClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';
import { PRICING } from '@/lib/billingConfig';
import { normalizePlanType, quotasForPlan } from '@/lib/billing/period';
import { writeAuditLog } from '@/lib/audit';

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

async function handleSimpleTrialActivation(payment_id: string, company_id: string, user_id: string) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // BLOCKER 3: Idempotency check - Prevent duplicate trial activation
  const { data: existingCompany, error: companyCheckError } = await supabase
    .from('companies')
    .select('id, subscription_status, trial_activated_at')
    .eq('id', company_id)
    .eq('user_id', user_id)
    .maybeSingle();

  if (companyCheckError) {
    console.error('Company check error:', companyCheckError);
    return NextResponse.json({ error: 'Failed to verify company' }, { status: 500 });
  }

  if (!existingCompany) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  // Check if trial already activated
  const isAlreadyTrial = existingCompany.subscription_status === 'trial' || existingCompany.trial_activated_at;
  if (isAlreadyTrial) {
    return NextResponse.json({
      success: false,
      message: 'Trial already activated for this company',
      already_activated: true,
    }, { status: 409 });
  }

  // BLOCKER 1: Verify Razorpay payment before activating trial
  let payment: any;
  try {
    const { keyId, keySecret } = getRazorpayKeys();
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    
    // Fetch payment from Razorpay API
    payment = await razorpay.payments.fetch(payment_id);
    
    // Verify payment status
    if (payment.status !== 'captured') {
      // Log failed verification attempt
      try {
        await writeAuditLog({
          companyId: company_id,
          actor: user_id || 'system',
          action: 'TRIAL_ACTIVATION_PAYMENT_VERIFICATION_FAILED',
          status: 'failed',
          integrationSystem: 'razorpay',
          metadata: {
            payment_id,
            payment_status: payment.status,
            reason: 'Payment not captured',
          },
        });
      } catch (auditErr) {
        console.error('Failed to log audit for payment verification failure:', auditErr);
      }
      
      return NextResponse.json({
        error: `Payment not captured. Payment status: ${payment.status}`,
        payment_status: payment.status,
      }, { status: 400 });
    }

    // Verify payment amount (₹5 = 500 paise)
    const amountPaise = typeof payment.amount === 'number' ? payment.amount : 0;
    const amountInr = amountPaise / 100;
    if (Math.abs(amountInr - 5.0) > 0.01) { // Allow small floating point differences
      return NextResponse.json({
        error: `Invalid payment amount. Expected ₹5, got ₹${amountInr}`,
        expected_amount: 5.0,
        actual_amount: amountInr,
      }, { status: 400 });
    }

    // Verify currency
    const currency = String(payment.currency || '').toUpperCase();
    if (currency !== 'INR') {
      return NextResponse.json({
        error: `Invalid payment currency. Expected INR, got ${currency}`,
        expected_currency: 'INR',
        actual_currency: currency,
      }, { status: 400 });
    }
  } catch (razorpayError: any) {
    console.error('Razorpay payment verification error:', razorpayError);
    
    // Log failed verification attempt
    try {
      await writeAuditLog({
        companyId: company_id,
        actor: user_id || 'system',
        action: 'TRIAL_ACTIVATION_PAYMENT_VERIFICATION_FAILED',
        status: 'failed',
        integrationSystem: 'razorpay',
        metadata: {
          payment_id,
          error: razorpayError.message || String(razorpayError),
        },
      });
    } catch (auditErr) {
      console.error('Failed to log audit for payment verification failure:', auditErr);
    }
    
    return NextResponse.json({
      error: `Failed to verify payment: ${razorpayError.message || 'Payment not found'}`,
    }, { status: 400 });
  }

  // Calculate trial end date (15 days from now)
  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + 15);
  const paidAt = payment.created_at ? new Date(payment.created_at * 1000).toISOString() : new Date().toISOString();

  // Update company with trial status
  const { error: companyError } = await supabase
    .from('companies')
    .update({
      subscription_status: 'trial',
      trial_end_date: trialEndDate.toISOString(),
      trial_activated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', company_id)
    .eq('user_id', user_id);

  if (companyError) {
    console.error('Company update error:', companyError);
    return NextResponse.json({ error: 'Failed to activate trial' }, { status: 500 });
  }

  // Record billing transaction
  await supabase.from('billing_transactions').insert({
    company_id,
    user_id,
    amount: 5.0,
    currency: 'INR',
    status: 'success',
    payment_method: 'razorpay',
    payment_id,
    description: 'Trial Activation Fee',
    transaction_type: 'trial_activation',
    created_at: paidAt,
  });

  // BLOCKER 2: Generate invoice for trial payment
  const reference = `trial_activation:${payment_id}`;
  
  // Check if invoice already exists (idempotency)
  const { data: existingInvoice } = await supabase
    .from('billing_invoices')
    .select('id')
    .eq('company_id', company_id)
    .eq('reference', reference)
    .maybeSingle();

  if (!existingInvoice) {
    // Create invoice with optional columns first, fallback to minimal if needed
    const invoiceRowWithOptionalColumns: any = {
      company_id,
      plan: 'Trial Activation',
      period_start: paidAt,
      period_end: trialEndDate.toISOString(),
      amount: 5.0,
      currency: 'INR',
      status: 'PAID',
      paid_at: paidAt,
      reference,
      provider: 'razorpay',
      provider_payment_id: payment_id,
      base_amount: 5.0,
      addons_amount: 0,
      wallet_applied: 0,
      metadata: {
        type: 'trial_activation',
        razorpay: { payment_id },
        created_by: 'system',
      },
    };

    const invoiceRowMinimal: any = {
      company_id,
      plan: 'Trial Activation',
      period_start: paidAt,
      period_end: trialEndDate.toISOString(),
      amount: 5.0,
      currency: 'INR',
      status: 'PAID',
      paid_at: paidAt,
      reference,
      metadata: {
        type: 'trial_activation',
        razorpay: { payment_id },
        created_by: 'system',
      },
    };

    // Try inserting with optional columns first
    const firstAttempt = await supabase
      .from('billing_invoices')
      .insert(invoiceRowWithOptionalColumns)
      .select('id')
      .maybeSingle();

    if (firstAttempt.error) {
      const msg = String(firstAttempt.error.message ?? firstAttempt.error);
      const looksLikeMissingColumn = /column .* does not exist/i.test(msg);
      
      if (looksLikeMissingColumn) {
        // Retry with minimal columns
        const secondAttempt = await supabase
          .from('billing_invoices')
          .insert(invoiceRowMinimal)
          .select('id')
          .maybeSingle();

        if (secondAttempt.error) {
          console.error('Failed to create trial invoice (minimal):', secondAttempt.error);
          // Continue - trial activated, invoice can be created manually if needed
        }
      } else {
        console.error('Failed to create trial invoice:', firstAttempt.error);
        // Continue - trial activated, invoice can be created manually if needed
      }
    }
  }

  // CRITICAL: Create company_subscriptions record so billing page can show trial details
  // Get starter monthly plan ID - try multiple queries if needed
  let starterPlanId: string | null = null;
  
  // Try exact match first
  let { data: starterPlan, error: planError } = await supabase
    .from('subscription_plans')
    .select('id')
    .eq('name', 'Starter')
    .eq('billing_cycle', 'monthly')
    .maybeSingle();

  // If not found, try case-insensitive or just name match
  if (planError || !starterPlan) {
    const { data: altPlan } = await supabase
      .from('subscription_plans')
      .select('id')
      .ilike('name', 'starter')
      .eq('billing_cycle', 'monthly')
      .maybeSingle();
    if (altPlan) starterPlan = altPlan;
  }

  // If still not found, get first monthly plan
  if (!starterPlan) {
    const { data: firstPlan } = await supabase
      .from('subscription_plans')
      .select('id')
      .eq('billing_cycle', 'monthly')
      .limit(1)
      .maybeSingle();
    if (firstPlan) starterPlan = firstPlan;
  }

  if (starterPlan?.id) {
    starterPlanId = starterPlan.id;
  }

  // ALWAYS create subscription record - check for existing first
  const { data: existingSubscription } = await supabase
    .from('company_subscriptions')
    .select('id, status')
    .eq('company_id', company_id)
    .maybeSingle();

  // CRITICAL: Always ensure subscription record exists for billing page
  if (!existingSubscription) {
    if (starterPlanId) {
      // Create subscription record - this is CRITICAL for billing page to work
      const { error: subError } = await supabase
        .from('company_subscriptions')
        .insert({
          company_id: company_id,
          plan_id: starterPlanId,
          status: 'TRIAL',
          trial_end: trialEndDate.toISOString(),
          current_period_end: trialEndDate.toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (subError) {
        console.error('CRITICAL: Failed to create subscription record:', subError);
        // Don't fail trial activation - log error but continue
        // Subscription can be created manually via admin fix tool
      }
    } else {
      console.error('CRITICAL: No plan ID found - cannot create subscription record');
      // Don't fail trial activation - subscription can be created later
    }
  } else if (existingSubscription.status !== 'TRIAL') {
    // Update existing subscription to TRIAL if it's not already
    await supabase
      .from('company_subscriptions')
      .update({
        status: 'TRIAL',
        trial_end: trialEndDate.toISOString(),
        current_period_end: trialEndDate.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingSubscription.id);
  }

  // BLOCKER 4: Audit log for trial activation
  try {
    await writeAuditLog({
      companyId: company_id,
      actor: user_id || 'system',
      action: 'TRIAL_ACTIVATED',
      status: 'success',
      integrationSystem: 'razorpay',
      metadata: {
        payment_id,
        amount: 5.0,
        currency: 'INR',
        trial_end_date: trialEndDate.toISOString(),
        description: '15-day free trial activated',
      },
    });
  } catch (auditError) {
    console.error('Failed to log audit event for trial activation:', auditError);
    // Continue - trial activated successfully, audit failure is logged
  }

  return NextResponse.json({
    success: true,
    message: 'Trial activated successfully',
    trial_end_date: trialEndDate.toISOString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const { payment_id, order_id, signature, company_id, plan, user_id } = await req.json();

    // Handle simple ₹5 trial activation (no order_id/signature)
    if (!order_id && payment_id && company_id && user_id) {
      return handleSimpleTrialActivation(payment_id, company_id, user_id);
    }

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
    // SSCC quota = pallet_labels_quota (primary SSCC level)
    const ssccQuota = quotas.pallet_labels_quota;
    
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
        sscc_labels_quota: ssccQuota, // SSCC quota = pallet quota
        user_seats_quota: quotas.user_seats_quota,
        
        // Usage (initialized to 0)
        unit_labels_used: 0,
        box_labels_used: 0,
        carton_labels_used: 0,
        pallet_labels_used: 0,
        sscc_labels_used: 0,
        user_seats_used: quotas.user_seats_quota,
        
        created_at: new Date().toISOString(),
      });

    if (billingError) {
      console.error('Failed to create billing usage:', billingError);
      // Continue - trial activated, billing can be fixed later
    }

    // Initialize quota_balances from billing_usage quotas
    // SSCC quota = pallet_labels_quota (primary SSCC level)
    try {
      const { error: quotaError } = await supabase.rpc('ensure_quota_balances', {
        p_company_id: company.id,
        p_plan_type: planKey,
      });

      if (quotaError) {
        console.error('Failed to initialize quota_balances:', quotaError);
        // Continue - quota can be initialized later
      }
    } catch (quotaErr) {
      console.error('Exception initializing quota_balances:', quotaErr);
      // Continue - quota can be initialized later
    }

    // FIX: Create company_subscriptions record so billing page can show trial details
    // Get plan ID for the selected plan
    const { data: selectedPlan, error: planError } = await supabase
      .from('subscription_plans')
      .select('id')
      .eq('name', planType === 'starter' ? 'Starter' : planType === 'growth' ? 'Growth' : 'Enterprise')
      .eq('billing_cycle', 'monthly')
      .maybeSingle();

    if (planError) {
      console.error('Failed to find plan:', planError);
    } else if (selectedPlan) {
      // Check if subscription already exists (idempotency)
      const { data: existingSubscription } = await supabase
        .from('company_subscriptions')
        .select('id')
        .eq('company_id', company.id)
        .maybeSingle();

      if (!existingSubscription && selectedPlan.id) {
        // Create subscription record
        const { error: subError } = await supabase
          .from('company_subscriptions')
          .insert({
            company_id: company.id,
            plan_id: selectedPlan.id,
            status: 'TRIAL',
            trial_end: trialEndDate.toISOString(),
            current_period_end: trialEndDate.toISOString(),
            razorpay_subscription_id: subscription?.id || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (subError) {
          console.error('Failed to create subscription record:', subError);
          // Continue - trial activated, subscription can be created manually if needed
        }
      }
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
            plan: planKey,
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
