// Grace Period Handling System
// Phase 3: Access Control and Grace Period
// Task 3.2: Implement comprehensive grace period handling

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/audit';
import { BillingErrors } from '@/lib/billing/errors';

export const GRACE_PERIOD_CONFIG = {
    DEFAULT_GRACE_DAYS: 7,
    MAX_GRACE_DAYS: 30,
    MIN_GRACE_DAYS: 1,
    TIER_BASIC_GRACE_DAYS: 3,
    TIER_STANDARD_GRACE_DAYS: 7,
    TIER_PREMIUM_GRACE_DAYS: 14,
    TIER_ENTERPRISE_GRACE_DAYS: 30,
} as const;

export enum GracePeriodStatus {
    ACTIVE = 'grace_period_active',
    EXPIRED = 'grace_period_expired',
    NOT_IN_GRACE_PERIOD = 'not_in_grace_period',
    SUBSCRIPTION_ACTIVE = 'subscription_active',
}

export interface GracePeriodConfig {
    grace_period_days: number;
    grace_period_status: GracePeriodStatus;
    days_remaining: number;
    expires_at: Date | null;
}

export function getGracePeriodDaysForTier(
    planCode?: string,
    isTrial: boolean = false
): number {
    if (isTrial) return 0;
    if (!planCode) return GRACE_PERIOD_CONFIG.DEFAULT_GRACE_DAYS;

    const lowerPlan = planCode.toLowerCase();
    
    if (lowerPlan.includes('enterprise')) {
        return GRACE_PERIOD_CONFIG.TIER_ENTERPRISE_GRACE_DAYS;
    }
    if (lowerPlan.includes('premium') || lowerPlan.includes('growth')) {
        return GRACE_PERIOD_CONFIG.TIER_PREMIUM_GRACE_DAYS;
    }
    if (lowerPlan.includes('starter')) {
        return GRACE_PERIOD_CONFIG.TIER_BASIC_GRACE_DAYS;
    }

    return GRACE_PERIOD_CONFIG.DEFAULT_GRACE_DAYS;
}

export async function getSubscriptionGracePeriod(
    companyId: string
): Promise<GracePeriodConfig> {
    const admin = getSupabaseAdmin();

    const { data: subscription, error } = await admin
        .from('company_subscriptions')
        .select('status, current_period_end, grace_period_end, plan_id, is_trial')
        .eq('company_id', companyId)
        .maybeSingle();

    if (error || !subscription) {
        throw BillingErrors.notFound('Subscription');
    }

    const now = new Date();
    const periodEnd = new Date(subscription.current_period_end);

    if (now < periodEnd) {
        return {
            grace_period_days: getGracePeriodDaysForTier(
                (subscription.plan_id as unknown as string) || undefined,
                subscription.is_trial
            ),
            grace_period_status: GracePeriodStatus.SUBSCRIPTION_ACTIVE,
            days_remaining: 0,
            expires_at: null,
        };
    }

    const graceEnd = subscription.grace_period_end 
        ? new Date(subscription.grace_period_end) 
        : null;

    if (graceEnd && now < graceEnd) {
        const daysRemaining = Math.ceil(
            (graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
            grace_period_days: Math.ceil(
                (graceEnd.getTime() - periodEnd.getTime()) / (1000 * 60 * 60 * 24)
            ),
            grace_period_status: GracePeriodStatus.ACTIVE,
            days_remaining: Math.max(0, daysRemaining),
            expires_at: graceEnd,
        };
    }

    return {
        grace_period_days: getGracePeriodDaysForTier(
            (subscription.plan_id as unknown as string) || undefined,
            subscription.is_trial
        ),
        grace_period_status: GracePeriodStatus.EXPIRED,
        days_remaining: 0,
        expires_at: null,
    };
}

export async function applyGracePeriod(
    companyId: string,
    subscriptionId: string
): Promise<{ success: boolean; gracePeriodEnd: Date | null; error?: string }> {
    const admin = getSupabaseAdmin();

    try {
        const { data: subscription, error: fetchError } = await admin
            .from('company_subscriptions')
            .select('plan_id, is_trial, current_period_end')
            .eq('id', subscriptionId)
            .single();

        if (fetchError) throw fetchError;

        const graceDays = getGracePeriodDaysForTier(
            (subscription.plan_id as unknown as string) || undefined,
            subscription.is_trial
        );

        const gracePeriodEnd = new Date();
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + graceDays);

        const { error: updateError } = await admin
            .from('company_subscriptions')
            .update({
                status: 'EXPIRED',
                grace_period_end: gracePeriodEnd.toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', subscriptionId);

        if (updateError) throw updateError;

        await admin
            .from('companies')
            .update({
                subscription_status: 'expired',
                updated_at: new Date().toISOString(),
            })
            .eq('id', companyId);

        await writeAuditLog({
            companyId,
            actor: 'system',
            action: 'grace_period_applied',
            status: 'success',
            integrationSystem: 'billing',
            metadata: {
                subscription_id: subscriptionId,
                grace_period_days: graceDays,
                grace_period_end: gracePeriodEnd.toISOString(),
            },
        }).catch(() => undefined);

        return { success: true, gracePeriodEnd };

    } catch (error: any) {
        console.error('Failed to apply grace period:', error);
        return { success: false, gracePeriodEnd: null, error: error.message };
    }
}

export function getGracePeriodAccessLevel(
    subscriptionStatus: string,
    gracePeriodStatus: GracePeriodStatus,
    daysRemaining: number
): {
    level: 'full' | 'limited' | 'none';
    features: string[];
    restrictions: string[];
    canExtend: boolean;
    message: string;
} {
    if (subscriptionStatus === 'ACTIVE' && gracePeriodStatus === GracePeriodStatus.SUBSCRIPTION_ACTIVE) {
        return {
            level: 'full',
            features: ['all'],
            restrictions: [],
            canExtend: true,
            message: 'Subscription is active',
        };
    }

    if (gracePeriodStatus === GracePeriodStatus.ACTIVE) {
        return {
            level: 'limited',
            features: ['view', 'export', 'renew'],
            restrictions: [
                'Cannot create new shipments',
                'Cannot purchase add-ons',
                'Cannot upgrade/downgrade plan',
                'Read-only access only',
            ],
            canExtend: daysRemaining > 0,
            message: `Subscription expired. Grace period active with ${daysRemaining} day(s) remaining. Please renew.`,
        };
    }

    return {
        level: 'none',
        features: [],
        restrictions: ['All features disabled', 'Subscription expired'],
        canExtend: false,
        message: 'Subscription has expired. Please renew to continue using the service.',
    };
}

export async function getSubscriptionStatusWithGrace(
    companyId: string
): Promise<{
    status: string;
    isActive: boolean;
    hasGracePeriod: boolean;
    daysRemainingInGrace: number;
    gracePeriodEnd: string | null;
    accessLevel: 'full' | 'limited' | 'none';
    message: string;
}> {
    const graceConfig = await getSubscriptionGracePeriod(companyId);
    const admin = getSupabaseAdmin();

    const { data: subscription, error } = await admin
        .from('company_subscriptions')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();

    if (error || !subscription) {
        throw BillingErrors.notFound('Subscription');
    }

    const accessLevel = getGracePeriodAccessLevel(
        subscription.status,
        graceConfig.grace_period_status,
        graceConfig.days_remaining
    );

    return {
        status: subscription.status,
        isActive: accessLevel.level !== 'none',
        hasGracePeriod: graceConfig.grace_period_status === GracePeriodStatus.ACTIVE,
        daysRemainingInGrace: graceConfig.days_remaining,
        gracePeriodEnd: graceConfig.expires_at?.toISOString() || null,
        accessLevel: accessLevel.level,
        message: accessLevel.message,
    };
}
