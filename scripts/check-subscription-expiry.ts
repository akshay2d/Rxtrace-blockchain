// Subscription Expiry Detection Cron Job
// Phase 2: Core Billing Logic Implementation
// Task 2.2: Automated expiry detection cron job

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration
const GRACE_PERIOD_DAYS = 7;
const BATCH_SIZE = 100;
const MAX_RETRIES = 3;

interface ExpiryJobResult {
    processed: number;
    expired: number;
    gracePeriod: number;
    failed: number;
    errors: string[];
}

interface SubscriptionRecord {
    id: string;
    company_id: string;
    status: string;
    current_period_end: string;
    razorpay_subscription_id: string | null;
    plan_id: string | null;
    is_trial: boolean;
}

interface CompanyRecord {
    id: string;
    company_name: string;
    email: string | null;
    owner_email: string | null;
}

async function checkSubscriptionExpiry(): Promise<ExpiryJobResult> {
    const result: ExpiryJobResult = {
        processed: 0,
        expired: 0,
        gracePeriod: 0,
        failed: 0,
        errors: [],
    };

    const now = new Date().toISOString();
    console.log(`[${now}] Starting subscription expiry check...`);

    try {
        // Find subscriptions that have expired but not yet marked as EXPIRED
        const { data: subscriptions, error, count } = await supabase
            .from('company_subscriptions')
            .select(`
                id,
                company_id,
                status,
                current_period_end,
                razorpay_subscription_id,
                plan_id,
                is_trial,
                companies!inner (
                    id,
                    company_name,
                    email,
                    owner_email
                )
            `)
            .in('status', ['ACTIVE', 'active', 'PAUSED', 'paused'])
            .lt('current_period_end', now)
            .range(0, BATCH_SIZE - 1);

        if (error) {
            result.errors.push(`Failed to fetch subscriptions: ${error.message}`);
            console.error('Error fetching subscriptions:', error);
            return result;
        }

        if (!subscriptions || subscriptions.length === 0) {
            console.log('No expired subscriptions found');
            return result;
        }

        result.processed += subscriptions.length;

        // Process each subscription
        for (const sub of subscriptions as any[]) {
            try {
                await processExpiredSubscription(sub, result);
            } catch (err: any) {
                result.failed++;
                result.errors.push(`Failed to process subscription ${sub.id}: ${err.message}`);
                console.error(`Error processing subscription ${sub.id}:`, err);
            }
        }

    } catch (err: any) {
        result.errors.push(`Critical error in expiry job: ${err.message}`);
        console.error('Critical error:', err);
    }

    // Process grace period expirations
    await processGracePeriodExpiry(result);

    // Log final result
    const endTime = new Date();
    const duration = endTime.getTime() - new Date(now).getTime();
    console.log(`[${endTime.toISOString()}] Expiry check completed in ${duration}ms`);
    console.log(`Result: processed=${result.processed}, expired=${result.expired}, gracePeriod=${result.gracePeriod}, failed=${result.failed}`);

    if (result.errors.length > 0) {
        console.log('Errors:', result.errors.slice(0, 10));
    }

    return result;
}

async function processExpiredSubscription(
    subscription: SubscriptionRecord,
    result: ExpiryJobResult
): Promise<void> {
    const company = subscription.companies as unknown as CompanyRecord;
    const companyId = company.id;
    const companyName = company.company_name;
    const email = company.owner_email || company.email;

    // Calculate grace period end date
    const gracePeriodEnd = new Date();
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS);

    // Update subscription status to EXPIRED with grace period
    const { error: updateError } = await supabase
        .from('company_subscriptions')
        .update({
            status: 'EXPIRED',
            grace_period_end: gracePeriodEnd.toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id);

    if (updateError) {
        throw new Error(`Failed to update subscription status: ${updateError.message}`);
    }

    // Update companies table
    await supabase
        .from('companies')
        .update({
            subscription_status: 'expired',
            subscription_expired_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', companyId);

    // Send expiry notification email
    await sendExpiryNotificationEmail({
        companyName,
        email: email || 'unknown@example.com',
        expiredAt: subscription.current_period_end,
        gracePeriodEnd: gracePeriodEnd.toISOString(),
    });

    result.expired++;
    console.log(`Subscription ${subscription.id} marked as EXPIRED for company ${companyId}`);
}

async function processGracePeriodExpiry(result: ExpiryJobResult): Promise<void> {
    const now = new Date().toISOString();

    // Find subscriptions where grace period has ended
    const { data: graceExpired, error } = await supabase
        .from('company_subscriptions')
        .select('id, company_id')
        .eq('status', 'EXPIRED')
        .lt('grace_period_end', now)
        .not('grace_period_end', 'is', null);

    if (error) {
        result.errors.push(`Failed to fetch grace period expired subscriptions: ${error.message}`);
        return;
    }

    if (!graceExpired || graceExpired.length === 0) {
        return;
    }

    // Update status to indicate complete expiration
    for (const sub of graceExpired) {
        await supabase
            .from('company_subscriptions')
            .update({
                status: 'EXPIRED',
                updated_at: new Date().toISOString(),
            })
            .eq('id', sub.id);

        // Completely revoke access
        await revokeAccessForCompany(sub.company_id);

        result.gracePeriod++;
    }

    console.log(`Marked ${graceExpired.length} subscriptions as fully expired after grace period`);
}

async function sendExpiryNotificationEmail(params: {
    companyName: string;
    email: string;
    expiredAt: string;
    gracePeriodEnd: string;
}): Promise<void> {
    console.log(`[EMAIL] Sending expiry notification to ${params.email}`);
    console.log(`[EMAIL] Company: ${params.companyName}`);
    console.log(`[EMAIL] Expired: ${params.expiredAt}`);
    console.log(`[EMAIL] Grace period ends: ${params.gracePeriodEnd}`);

    // TODO: Implement actual email sending
    // await sendEmail({
    //     to: params.email,
    //     subject: 'Your subscription has expired',
    //     template: 'subscription-expired',
    //     data: params,
    // });
}

async function revokeAccessForCompany(companyId: string): Promise<void> {
    console.log(`[ACCESS] Revoking access for company ${companyId}`);

    // TODO: Implement access revocation
    // - Update company subscription status
    // - Revoke API access
    // - Disable features
}

// Run if executed directly
if (require.main === module) {
    checkSubscriptionExpiry()
        .then((result) => {
            console.log('\n=== Expiry Job Results ===');
            console.log(JSON.stringify(result, null, 2));
            process.exit(result.failed > 0 ? 1 : 0);
        })
        .catch((err) => {
            console.error('Job failed:', err);
            process.exit(1);
        });
}

export { checkSubscriptionExpiry };
