// Resume Functionality Handler
// Phase 2: Core Billing Logic Implementation
// Task 2.3: Address resume functionality gap

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/audit';

interface ResumeResult {
    success: boolean;
    localStatusUpdated: boolean;
    razorpaySynced: boolean;
    error?: string;
    warning?: string;
}

/**
 * Resume a paused or cancelled subscription
 * 
 * IMPORTANT: Razorpay does not have a direct "resume" API.
 * This function updates local state and provides workarounds for Razorpay sync.
 */
export async function handleSubscriptionResume(
    companyId: string,
    subscriptionId: string
): Promise<ResumeResult> {
    const admin = getSupabaseAdmin();
    const result: ResumeResult = {
        success: true,
        localStatusUpdated: false,
        razorpaySynced: false,
    };

    console.log(`[RESUME] Processing resume for subscription ${subscriptionId} (company: ${companyId})`);

    try {
        // Fetch current subscription
        const { data: subscription, error: fetchError } = await admin
            .from('company_subscriptions')
            .select('*')
            .eq('razorpay_subscription_id', subscriptionId)
            .eq('company_id', companyId)
            .single();

        if (fetchError) {
            return {
                success: false,
                localStatusUpdated: false,
                razorpaySynced: false,
                error: `Failed to fetch subscription: ${fetchError.message}`,
            };
        }

        // Validate subscription can be resumed
        if (subscription.status !== 'PAUSED' && subscription.status !== 'CANCELLED') {
            return {
                success: false,
                localStatusUpdated: false,
                razorpaySynced: false,
                error: `Cannot resume subscription with status: ${subscription.status}`,
            };
        }

        // Update local status to ACTIVE
        const { error: updateError } = await admin
            .from('company_subscriptions')
            .update({
                status: 'ACTIVE',
                pause_end_date: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', subscription.id);

        if (updateError) {
            return {
                success: false,
                localStatusUpdated: false,
                razorpaySynced: false,
                error: `Failed to update subscription status: ${updateError.message}`,
            };
        }

        result.localStatusUpdated = true;

        // Update companies table
        await admin
            .from('companies')
            .update({
                subscription_status: 'active',
                subscription_updated_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', companyId);

        // Attempt to sync with Razorpay
        const razorpayResult = await syncResumeToRazorpay(subscriptionId, companyId);
        result.razorpaySynced = razorpayResult.success;

        if (!razorpayResult.success) {
            result.warning = razorpayResult.warning;
            
            // Alert admin when Razorpay sync fails
            await alertAdminForManualResume({
                subscriptionId,
                companyId,
                attemptedAt: new Date().toISOString(),
                reason: razorpayResult.error,
            });
        }

        // Write audit log
        await writeAuditLog({
            companyId,
            actor: 'system',
            action: 'subscription_resumed',
            status: 'success',
            integrationSystem: razorpayResult.success ? 'razorpay' : 'local',
            metadata: {
                subscription_id: subscriptionId,
                local_updated: result.localStatusUpdated,
                razorpay_synced: result.razorpaySynced,
                warning: result.warning,
            },
        }).catch(() => undefined);

        console.log(`[RESUME] Resume completed for ${subscriptionId}: local=${result.localStatusUpdated}, razorpay=${result.razorpaySynced}`);

        return result;

    } catch (error: any) {
        console.error(`[RESUME] Error resuming subscription ${subscriptionId}:`, error);
        
        return {
            success: false,
            localStatusUpdated: result.localStatusUpdated,
            razorpaySynced: result.razorpaySynced,
            error: error.message,
        };
    }
}

/**
 * Attempt to sync resume action to Razorpay
 * Since Razorpay doesn't have a direct resume API, we try various approaches
 */
async function syncResumeToRazorpay(
    subscriptionId: string,
    companyId: string
): Promise<{ success: boolean; error?: string; warning?: string }> {
    try {
        // Razorpay doesn't have a direct "resume" API for paused subscriptions
        // Options: 
        // 1. If pause was indefinite, we can try to update with pause_at: 0
        // 2. For cancelled subscriptions, need to create new subscription
        // 3. Alert admin for manual intervention

        // Try to fetch subscription status from Razorpay
        const razorpay = await import('@/lib/razorpay/server').then(m => m.createRazorpayClient());
        
        try {
            const subscription = await (razorpay.subscriptions as any).fetch(subscriptionId);
            
            // If subscription is paused, try to remove pause
            if (subscription.status === 'paused') {
                // Razorpay may allow removing pause_at
                try {
                    await (razorpay.subscriptions as any).update(subscriptionId, {
                        pause_at: 0,
                    });
                    return { success: true };
                } catch (updateError: any) {
                    // If update fails, subscription may need manual intervention
                    return {
                        success: false,
                        warning: 'Razorpay subscription remains paused. Manual resume may be required.',
                        error: updateError.message,
                    };
                }
            }

            // If already active, no action needed
            if (subscription.status === 'active') {
                return { success: true };
            }

        } catch (fetchError: any) {
            // Subscription not found in Razorpay or API error
            return {
                success: false,
                warning: 'Subscription not found in Razorpay. Please contact support.',
                error: fetchError.message,
            };
        }

        return { success: false, warning: 'Unknown subscription status' };

    } catch (error: any) {
        return {
            success: false,
            error: error.message,
            warning: 'Failed to communicate with Razorpay',
        };
    }
}

/**
 * Alert admin when Razorpay sync fails
 */
async function alertAdminForManualResume(params: {
    subscriptionId: string;
    companyId: string;
    attemptedAt: string;
    reason?: string;
}): Promise<void> {
    const admin = getSupabaseAdmin();

    // Try to log to admin alerts table if it exists
    try {
        await admin
            .from('admin_alerts')
            .insert({
                alert_type: 'RAZORPAY_RESUME_REQUIRED',
                severity: 'medium',
                title: 'Manual Razorpay Resume Required',
                message: `Subscription ${params.subscriptionId} for company ${params.companyId} needs manual resume in Razorpay dashboard.`,
                metadata: {
                    subscription_id: params.subscriptionId,
                    company_id: params.companyId,
                    attempted_at: params.attemptedAt,
                    reason: params.reason,
                },
                status: 'pending',
                created_at: new Date().toISOString(),
            });
    } catch (error: any) {
        // Table might not exist, log to console
        console.warn(`[ALERT] Manual resume needed for subscription ${params.subscriptionId}`);
    }

    console.warn(`[RESUME] ALERT: Razorpay sync failed for subscription ${params.subscriptionId}`);
}

/**
 * Check if subscription can be resumed
 */
export async function canResumeSubscription(
    companyId: string
): Promise<{ canResume: boolean; status?: string; error?: string }> {
    const admin = getSupabaseAdmin();

    const { data: subscription, error } = await admin
        .from('company_subscriptions')
        .select('status')
        .eq('company_id', companyId)
        .single();

    if (error) {
        return { canResume: false, error: error.message };
    }

    if (!subscription) {
        return { canResume: false, error: 'No subscription found' };
    }

    if (subscription.status === 'PAUSED' || subscription.status === 'CANCELLED') {
        return { canResume: true, status: subscription.status };
    }

    if (subscription.status === 'ACTIVE') {
        return { canResume: false, status: 'already_active' };
    }

    return { canResume: false, status: subscription.status };
}
