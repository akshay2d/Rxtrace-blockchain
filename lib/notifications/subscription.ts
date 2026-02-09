// PHASE-8: Email notification handlers for subscription lifecycle events

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/client';

export interface SubscriptionNotificationParams {
  companyId: string;
  companyName: string;
  userEmail: string;
  userName: string;
  subscriptionId: string;
  planName: string;
  billingCycle: string;
  amount: number;
  status: string;
  currentPeriodEnd?: string;
  additionalInfo?: Record<string, any>;
}

/**
 * Send subscription activation notification
 */
export async function sendSubscriptionActivatedEmail(params: SubscriptionNotificationParams): Promise<boolean> {
  const {
    userEmail,
    userName,
    planName,
    billingCycle,
    amount,
    currentPeriodEnd,
  } = params;

  const subject = `🎉 Subscription Activated - ${planName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #2563eb;">Subscription Activated!</h1>
      <p>Hi ${userName},</p>
      <p>Great news! Your subscription has been activated.</p>
      
      <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Subscription Details</h3>
        <p><strong>Plan:</strong> ${planName}</p>
        <p><strong>Billing Cycle:</strong> ${billingCycle}</p>
        <p><strong>Amount:</strong> ₹${amount.toLocaleString('en-IN')}</p>
        ${currentPeriodEnd ? `<p><strong>Next Billing Date:</strong> ${new Date(currentPeriodEnd).toLocaleDateString('en-IN')}</p>` : ''}
      </div>
      
      <p>Your subscription is now active and you have full access to all features.</p>
      
      <p>Thank you for choosing RxTrace!</p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #6b7280; font-size: 14px;">
        If you have any questions, please contact our support team.
      </p>
    </div>
  `;

  try {
    await sendEmail({
      to: userEmail,
      subject,
      html,
    });
    console.log(`Subscription activated email sent to ${userEmail}`);
    return true;
  } catch (error) {
    console.error('Failed to send subscription activated email:', error);
    return false;
  }
}

/**
 * Send subscription pending payment notification
 */
export async function sendSubscriptionPendingEmail(params: SubscriptionNotificationParams): Promise<boolean> {
  const {
    userEmail,
    userName,
    planName,
    billingCycle,
    amount,
  } = params;

  const subject = `⏳ Payment Pending - ${planName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #d97706;">Payment Pending</h1>
      <p>Hi ${userName},</p>
      <p>We've received your subscription request and are waiting for payment confirmation.</p>
      
      <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #f59e0b;">
        <h3 style="margin-top: 0; color: #92400e;">Pending Payment</h3>
        <p><strong>Plan:</strong> ${planName}</p>
        <p><strong>Billing Cycle:</strong> ${billingCycle}</p>
        <p><strong>Amount:</strong> ₹${amount.toLocaleString('en-IN')}</p>
      </div>
      
      <p>Once your payment is confirmed, you'll receive an activation email.</p>
      <p><strong>Note:</strong> Features will be available once payment is confirmed.</p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #6b7280; font-size: 14px;">
        If you believe this is an error, please contact our support team.
      </p>
    </div>
  `;

  try {
    await sendEmail({
      to: userEmail,
      subject,
      html,
    });
    console.log(`Subscription pending email sent to ${userEmail}`);
    return true;
  } catch (error) {
    console.error('Failed to send subscription pending email:', error);
    return false;
  }
}

/**
 * Send subscription cancelled notification
 */
export async function sendSubscriptionCancelledEmail(params: SubscriptionNotificationParams): Promise<boolean> {
  const {
    userEmail,
    userName,
    planName,
    currentPeriodEnd,
  } = params;

  const subject = `⚠️ Subscription Cancelled - ${planName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #dc2626;">Subscription Cancelled</h1>
      <p>Hi ${userName},</p>
      <p>Your subscription has been cancelled.</p>
      
      <div style="background: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fca5a5;">
        <h3 style="margin-top: 0; color: #991b1b;">Cancellation Details</h3>
        <p><strong>Plan:</strong> ${planName}</p>
        ${currentPeriodEnd ? `<p><strong>Access Until:</strong> ${new Date(currentPeriodEnd).toLocaleDateString('en-IN')}</p>` : ''}
      </div>
      
      <p>You will continue to have access until the end of your current billing period.</p>
      <p>You can reactivate your subscription at any time before the period ends.</p>
      
      <p style="margin-top: 20px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing" 
           style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
          View Subscription
        </a>
      </p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #6b7280; font-size: 14px;">
        If you cancelled by mistake, please contact our support team immediately.
      </p>
    </div>
  `;

  try {
    await sendEmail({
      to: userEmail,
      subject,
      html,
    });
    console.log(`Subscription cancelled email sent to ${userEmail}`);
    return true;
  } catch (error) {
    console.error('Failed to send subscription cancelled email:', error);
    return false;
  }
}

/**
 * Send subscription paused notification
 */
export async function sendSubscriptionPausedEmail(params: SubscriptionNotificationParams): Promise<boolean> {
  const {
    userEmail,
    userName,
    planName,
  } = params;

  const subject = `⏸️ Subscription Paused - ${planName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #ea580c;">Subscription Paused</h1>
      <p>Hi ${userName},</p>
      <p>Your subscription has been paused.</p>
      
      <div style="background: #ffedd5; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fb923c;">
        <p><strong>Plan:</strong> ${planName}</p>
      </div>
      
      <p>Your subscription is temporarily paused. You can resume it anytime to continue your access.</p>
      
      <p style="margin-top: 20px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing" 
           style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
          Resume Subscription
        </a>
      </p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #6b7280; font-size: 14px;">
        Need help? Contact our support team.
      </p>
    </div>
  `;

  try {
    await sendEmail({
      to: userEmail,
      subject,
      html,
    });
    console.log(`Subscription paused email sent to ${userEmail}`);
    return true;
  } catch (error) {
    console.error('Failed to send subscription paused email:', error);
    return false;
  }
}

/**
 * Send subscription expired notification
 */
export async function sendSubscriptionExpiredEmail(params: SubscriptionNotificationParams): Promise<boolean> {
  const {
    userEmail,
    userName,
    planName,
  } = params;

  const subject = `❌ Subscription Expired - ${planName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #6b7280;">Subscription Expired</h1>
      <p>Hi ${userName},</p>
      <p>Your subscription has expired.</p>
      
      <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Plan:</strong> ${planName}</p>
      </div>
      
      <p>To continue using RxTrace, please renew your subscription.</p>
      
      <p style="margin-top: 20px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/pricing" 
           style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
          Renew Subscription
        </a>
      </p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #6b7280; font-size: 14px;">
        Have questions? Contact our support team.
      </p>
    </div>
  `;

  try {
    await sendEmail({
      to: userEmail,
      subject,
      html,
    });
    console.log(`Subscription expired email sent to ${userEmail}`);
    return true;
  } catch (error) {
    console.error('Failed to send subscription expired email:', error);
    return false;
  }
}

/**
 * Send subscription payment failed notification
 */
export async function sendPaymentFailedEmail(params: SubscriptionNotificationParams): Promise<boolean> {
  const {
    userEmail,
    userName,
    planName,
    amount,
    additionalInfo,
  } = params;

  const subject = `⚠️ Payment Failed - ${planName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #dc2626;">Payment Failed</h1>
      <p>Hi ${userName},</p>
      <p>We attempted to process your subscription payment but it failed.</p>
      
      <div style="background: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #fca5a5;">
        <p><strong>Plan:</strong> ${planName}</p>
        <p><strong>Amount:</strong> ₹${amount.toLocaleString('en-IN')}</p>
        ${additionalInfo?.error ? `<p><strong>Reason:</strong> ${additionalInfo.error}</p>` : ''}
      </div>
      
      <p>Please update your payment method to continue your subscription.</p>
      
      <p style="margin-top: 20px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing" 
           style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
          Update Payment Method
        </a>
      </p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #6b7280; font-size: 14px;">
        If you need assistance, please contact our support team.
      </p>
    </div>
  `;

  try {
    await sendEmail({
      to: userEmail,
      subject,
      html,
    });
    console.log(`Payment failed email sent to ${userEmail}`);
    return true;
  } catch (error) {
    console.error('Failed to send payment failed email:', error);
    return false;
  }
}

/**
 * Helper to get subscription notification params from database
 */
export async function getSubscriptionNotificationParams(
  companyId: string,
  status: string
): Promise<SubscriptionNotificationParams | null> {
  const admin = getSupabaseAdmin();

  // Get company and user info
  const { data: company } = await admin
    .from('companies')
    .select('id, company_name, user_id, email')
    .eq('id', companyId)
    .maybeSingle();

  if (!company) {
    return null;
  }

  // Get user email
  const { data: { user } } = await admin.auth.admin.getUserById(company.user_id);

  // Get subscription info
  const { data: subscription } = await admin
    .from('company_subscriptions')
    .select('id, plan_id, status, razorpay_subscription_id, current_period_end')
    .eq('company_id', companyId)
    .maybeSingle();

  // Get plan info
  let planName = 'Unknown Plan';
  let billingCycle = 'Unknown';
  let amount = 0;

  if (subscription?.plan_id) {
    const { data: plan } = await admin
      .from('subscription_plans')
      .select('name, billing_cycle, base_price')
      .eq('id', subscription.plan_id)
      .maybeSingle();

    if (plan) {
      planName = plan.name || planName;
      billingCycle = plan.billing_cycle || billingCycle;
      amount = Number(plan.base_price || 0);
    }
  }

  return {
    companyId,
    companyName: company.company_name,
    userEmail: user?.email || company.email || '',
    userName: company.company_name,
    subscriptionId: subscription?.razorpay_subscription_id || subscription?.id || '',
    planName,
    billingCycle,
    amount,
    status,
    currentPeriodEnd: subscription?.current_period_end,
  };
}
