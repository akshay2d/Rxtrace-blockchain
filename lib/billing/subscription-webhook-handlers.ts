// Subscription Webhook Event Handlers
// Phase 1: Critical Database Schema Fixes
// Task 1.3: Explicit webhook event handlers for subscription flow

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/audit';

// Import logging utilities from webhook route
// These will be injected or used via console in standalone usage

/**
 * Generate idempotency key for webhook event
 */
export function generateWebhookIdempotencyKey(eventId: string, entityType: string, entityId: string): string {
    return `webhook:${eventId}:${entityType}:${entityId}`;
}

/**
 * Razorpay status to internal status mapping
 */
function mapRazorpayStatus(status: string): 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'EXPIRED' | 'TRIAL' {
    const normalizedStatus = status?.toLowerCase() || '';
    
    switch (normalizedStatus) {
        case 'active':
            return 'ACTIVE';
        case 'paused':
            return 'PAUSED';
        case 'cancelled':
        case 'completed':
            return 'CANCELLED';
        case 'expired':
            return 'EXPIRED';
        default:
            return 'ACTIVE';
    }
}

/**
 * Handler for subscription.activated event
 */
export async function handleSubscriptionActivated(
    payload: any,
    correlationId: string
): Promise<{ success: boolean; error?: string; companyId?: string }> {
    const admin = getSupabaseAdmin();
    const entity = payload.payload?.subscription?.entity;
    
    if (!entity?.id) {
        return { success: false, error: 'Missing subscription entity ID' };
    }

    const subscriptionId = entity.id;
    const companyId = entity.notes?.company_id;
    const planId = entity.plan_id;
    const currentEnd = entity.current_end 
        ? new Date(entity.current_end * 1000).toISOString() 
        : null;

    console.log(`[${correlationId}] Processing subscription.activated for ${subscriptionId}`);

    if (!companyId) {
        console.warn(`[${correlationId}] No company_id in subscription notes for ${subscriptionId}`);
        return { success: false, error: 'No company_id in subscription notes', companyId: undefined };
    }

    try {
        // Update company_subscriptions status to ACTIVE
        const { data: existingSub, error: subError } = await admin
            .from('company_subscriptions')
            .select('id, status, plan_id')
            .eq('razorpay_subscription_id', subscriptionId)
            .maybeSingle();

        if (subError) {
            throw new Error(`Failed to fetch subscription: ${subError.message}`);
        }

        if (existingSub) {
            // Update existing subscription
            const { error: updateError } = await admin
                .from('company_subscriptions')
                .update({
                    status: 'ACTIVE',
                    subscription_activated_at: new Date().toISOString(),
                    current_period_end: currentEnd,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', existingSub.id);

            if (updateError) {
                throw new Error(`Failed to update subscription: ${updateError.message}`);
            }
        } else {
            // Create new subscription record if it doesn't exist
            let plan_id: string | null = null;
            if (planId) {
                const { data: plan } = await admin
                    .from('subscription_plans')
                    .select('id, name, billing_cycle')
                    .eq('razorpay_plan_id', planId)
                    .maybeSingle();
                plan_id = plan?.id || null;
            }

            const { error: insertError } = await admin
                .from('company_subscriptions')
                .insert({
                    company_id: companyId,
                    plan_id,
                    razorpay_subscription_id: subscriptionId,
                    status: 'ACTIVE',
                    current_period_end: currentEnd,
                    subscription_created_at: new Date().toISOString(),
                    subscription_activated_at: new Date().toISOString(),
                });

            if (insertError) {
                throw new Error(`Failed to create subscription: ${insertError.message}`);
            }
        }

        // Update companies table for backward compatibility
        await admin
            .from('companies')
            .update({
                subscription_status: 'active',
                razorpay_subscription_id: subscriptionId,
                razorpay_subscription_status: 'active',
                subscription_updated_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', companyId);

        // Write audit log
        await writeAuditLog({
            companyId,
            actor: 'system',
            action: 'razorpay_subscription_activated',
            status: 'success',
            integrationSystem: 'razorpay',
            metadata: {
                event: 'subscription.activated',
                subscription_id: subscriptionId,
                company_id: companyId,
                plan_id: planId,
            },
        }).catch(() => undefined);

        console.log(`[${correlationId}] Subscription activated successfully for company ${companyId}`);
        
        return { success: true, companyId };
    } catch (error: any) {
        console.error(`[${correlationId}] Failed to handle subscription.activated:`, error);
        return { success: false, error: error.message, companyId };
    }
}

/**
 * Handler for payment.failed event
 */
export async function handlePaymentFailed(
    payload: any,
    correlationId: string
): Promise<{ success: boolean; error?: string; companyId?: string; paymentId?: string }> {
    const admin = getSupabaseAdmin();
    const entity = payload.payload?.payment?.entity;
    
    if (!entity?.id) {
        return { success: false, error: 'Missing payment entity ID' };
    }

    const paymentId = entity.id;
    const subscriptionId = entity.subscription_id;
    const companyId = entity.notes?.company_id;
    const errorCode = entity.error_code;
    const errorDescription = entity.error_description;

    console.log(`[${correlationId}] Processing payment.failed for payment ${paymentId}`);

    try {
        // Generate idempotency key
        const idempotencyKey = generateWebhookIdempotencyKey(
            `payment_failed_${paymentId}`,
            'payment',
            paymentId
        );

        // Store failed payment event for idempotency
        const { data: existingEvent } = await admin
            .from('webhook_events')
            .select('id')
            .eq('idempotency_key', idempotencyKey)
            .maybeSingle();

        if (existingEvent) {
            console.log(`[${correlationId}] Duplicate payment.failed event skipped`);
            return { success: true, paymentId, companyId: companyId || undefined };
        }

        // Insert webhook event
        await admin
            .from('webhook_events')
            .insert({
                idempotency_key: idempotencyKey,
                event_type: 'payment.failed',
                entity_id: paymentId,
                entity_type: 'payment',
                payload,
                processing_status: 'completed',
                processed_at: new Date().toISOString(),
            });

        // Update pending payment status
        if (companyId && subscriptionId) {
            await admin
                .from('company_subscriptions')
                .update({
                    pending_payment_id: null,
                    updated_at: new Date().toISOString(),
                })
                .eq('razorpay_subscription_id', subscriptionId);
        }

        // Write audit log
        if (companyId) {
            await writeAuditLog({
                companyId,
                actor: 'system',
                action: 'razorpay_payment_failed',
                status: 'success',
                integrationSystem: 'razorpay',
                metadata: {
                    event: 'payment.failed',
                    payment_id: paymentId,
                    subscription_id: subscriptionId,
                    error_code: errorCode,
                    error_description: errorDescription,
                },
            }).catch(() => undefined);

            // Trigger alert for failed payment (can be extended)
            console.warn(`[${correlationId}] ALERT: Payment failed for company ${companyId}: ${errorCode} - ${errorDescription}`);
        }

        return { success: true, paymentId, companyId };
    } catch (error: any) {
        console.error(`[${correlationId}] Failed to handle payment.failed:`, error);
        return { success: false, error: error.message, paymentId };
    }
}

/**
 * Handler for subscription.paused event
 */
export async function handleSubscriptionPaused(
    payload: any,
    correlationId: string
): Promise<{ success: boolean; error?: string; companyId?: string }> {
    const admin = getSupabaseAdmin();
    const entity = payload.payload?.subscription?.entity;
    
    if (!entity?.id) {
        return { success: false, error: 'Missing subscription entity ID' };
    }

    const subscriptionId = entity.id;
    const companyId = entity.notes?.company_id;
    const pauseEndAt = entity.pause_at 
        ? new Date(entity.pause_at * 1000).toISOString() 
        : null;

    console.log(`[${correlationId}] Processing subscription.paused for ${subscriptionId}`);

    if (!companyId) {
        return { success: false, error: 'No company_id in subscription notes', companyId: undefined };
    }

    try {
        // Update subscription status to PAUSED
        const { error: updateError } = await admin
            .from('company_subscriptions')
            .update({
                status: 'PAUSED',
                pause_end_date: pauseEndAt,
                updated_at: new Date().toISOString(),
            })
            .eq('razorpay_subscription_id', subscriptionId);

        if (updateError) {
            throw new Error(`Failed to update subscription: ${updateError.message}`);
        }

        // Update companies table
        await admin
            .from('companies')
            .update({
                subscription_status: 'paused',
                razorpay_subscription_status: 'paused',
                subscription_updated_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', companyId);

        // Write audit log
        await writeAuditLog({
            companyId,
            actor: 'system',
            action: 'razorpay_subscription_paused',
            status: 'success',
            integrationSystem: 'razorpay',
            metadata: {
                event: 'subscription.paused',
                subscription_id: subscriptionId,
                pause_end_at: pauseEndAt,
            },
        }).catch(() => undefined);

        console.log(`[${correlationId}] Subscription paused for company ${companyId}`);
        
        return { success: true, companyId };
    } catch (error: any) {
        console.error(`[${correlationId}] Failed to handle subscription.paused:`, error);
        return { success: false, error: error.message, companyId };
    }
}

/**
 * Handler for subscription.resumed event
 */
export async function handleSubscriptionResumed(
    payload: any,
    correlationId: string
): Promise<{ success: boolean; error?: string; companyId?: string }> {
    const admin = getSupabaseAdmin();
    const entity = payload.payload?.subscription?.entity;
    
    if (!entity?.id) {
        return { success: false, error: 'Missing subscription entity ID' };
    }

    const subscriptionId = entity.id;
    const companyId = entity.notes?.company_id;

    console.log(`[${correlationId}] Processing subscription.resumed for ${subscriptionId}`);

    if (!companyId) {
        return { success: false, error: 'No company_id in subscription notes', companyId: undefined };
    }

    try {
        // Update subscription status to ACTIVE
        const { error: updateError } = await admin
            .from('company_subscriptions')
            .update({
                status: 'ACTIVE',
                pause_end_date: null,
                updated_at: new Date().toISOString(),
            })
            .eq('razorpay_subscription_id', subscriptionId);

        if (updateError) {
            throw new Error(`Failed to update subscription: ${updateError.message}`);
        }

        // Update companies table
        await admin
            .from('companies')
            .update({
                subscription_status: 'active',
                razorpay_subscription_status: 'active',
                subscription_updated_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', companyId);

        // Write audit log
        await writeAuditLog({
            companyId,
            actor: 'system',
            action: 'razorpay_subscription_resumed',
            status: 'success',
            integrationSystem: 'razorpay',
            metadata: {
                event: 'subscription.resumed',
                subscription_id: subscriptionId,
            },
        }).catch(() => undefined);

        console.log(`[${correlationId}] Subscription resumed for company ${companyId}`);
        
        return { success: true, companyId };
    } catch (error: any) {
        console.error(`[${correlationId}] Failed to handle subscription.resumed:`, error);
        return { success: false, error: error.message, companyId };
    }
}

/**
 * Handler for subscription.cancelled event
 */
export async function handleSubscriptionCancelled(
    payload: any,
    correlationId: string
): Promise<{ success: boolean; error?: string; companyId?: string }> {
    const admin = getSupabaseAdmin();
    const entity = payload.payload?.subscription?.entity;
    
    if (!entity?.id) {
        return { success: false, error: 'Missing subscription entity ID' };
    }

    const subscriptionId = entity.id;
    const companyId = entity.notes?.company_id;
    const cancelAtCycleEnd = entity.cancel_at_cycle_end === true || entity.cancel_at_cycle_end === 1;
    const currentEnd = entity.current_end 
        ? new Date(entity.current_end * 1000).toISOString() 
        : null;

    console.log(`[${correlationId}] Processing subscription.cancelled for ${subscriptionId}`);

    if (!companyId) {
        return { success: false, error: 'No company_id in subscription notes', companyId: undefined };
    }

    try {
        // Determine status based on cancel_at_cycle_end
        const status = cancelAtCycleEnd ? 'ACTIVE' : 'CANCELLED';

        // Update subscription status
        const { error: updateError } = await admin
            .from('company_subscriptions')
            .update({
                status,
                current_period_end: currentEnd,
                updated_at: new Date().toISOString(),
            })
            .eq('razorpay_subscription_id', subscriptionId);

        if (updateError) {
            throw new Error(`Failed to update subscription: ${updateError.message}`);
        }

        // Update companies table
        await admin
            .from('companies')
            .update({
                subscription_status: cancelAtCycleEnd ? 'active' : 'cancelled',
                razorpay_subscription_status: 'cancelled',
                subscription_cancel_at_period_end: cancelAtCycleEnd,
                subscription_current_period_end: currentEnd,
                subscription_updated_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', companyId);

        // Write audit log
        await writeAuditLog({
            companyId,
            actor: 'system',
            action: 'razorpay_subscription_cancelled',
            status: 'success',
            integrationSystem: 'razorpay',
            metadata: {
                event: 'subscription.cancelled',
                subscription_id: subscriptionId,
                cancel_at_cycle_end: cancelAtCycleEnd,
            },
        }).catch(() => undefined);

        console.log(`[${correlationId}] Subscription cancelled for company ${companyId} (cancel_at_cycle_end: ${cancelAtCycleEnd})`);
        
        return { success: true, companyId };
    } catch (error: any) {
        console.error(`[${correlationId}] Failed to handle subscription.cancelled:`, error);
        return { success: false, error: error.message, companyId };
    }
}

/**
 * Event dispatcher that routes to appropriate handler
 */
export async function handleSubscriptionWebhookEvent(
    eventType: string,
    payload: any,
    correlationId: string
): Promise<{ success: boolean; error?: string }> {
    switch (eventType) {
        case 'subscription.activated':
            return handleSubscriptionActivated(payload, correlationId)
                .then(result => ({ success: result.success, error: result.error }));
        
        case 'subscription.paused':
            return handleSubscriptionPaused(payload, correlationId)
                .then(result => ({ success: result.success, error: result.error }));
        
        case 'subscription.resumed':
            return handleSubscriptionResumed(payload, correlationId)
                .then(result => ({ success: result.success, error: result.error }));
        
        case 'subscription.cancelled':
            return handleSubscriptionCancelled(payload, correlationId)
                .then(result => ({ success: result.success, error: result.error }));
        
        case 'payment.failed':
            return handlePaymentFailed(payload, correlationId)
                .then(result => ({ success: result.success, error: result.error }));
        
        default:
            console.log(`[${correlationId}] Unhandled subscription event type: ${eventType}`);
            return { success: true }; // Acknowledge unhandled events
    }
}
