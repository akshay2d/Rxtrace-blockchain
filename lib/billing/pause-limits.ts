// Pause Duration Limits Configuration and Validation
// Phase 3: Access Control and Grace Period
// Task 3.1: Implement pause duration limits

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { BillingErrors, BillingErrorCode } from '@/lib/billing/errors';

// Configuration defaults
export const PAUSE_CONFIG = {
    DEFAULT_MAX_PAUSE_DAYS: 30,
    MIN_PAUSE_DAYS: 1,
    MAX_PAUSE_DAYS: 90, // Absolute maximum
    DEFAULT_PAUSE_DAYS: 7,
    MAX_TOTAL_PAUSE_DAYS_PER_YEAR: 90,
} as const;

// Pause duration request interface
export interface PauseDurationRequest {
    duration_days?: number; // Optional, defaults to max
    reason?: string;
}

// Configuration stored in database or environment
export interface PauseConfig {
    max_pause_duration_days: number;
    min_pause_duration_days: number;
    default_pause_duration_days: number;
    max_total_pause_days_per_year: number;
}

// Get pause configuration (from DB or defaults)
export async function getPauseConfig(companyId?: string): Promise<PauseConfig> {
    // Default configuration
    const defaultConfig: PauseConfig = {
        max_pause_duration_days: PAUSE_CONFIG.DEFAULT_MAX_PAUSE_DAYS,
        min_pause_duration_days: PAUSE_CONFIG.MIN_PAUSE_DAYS,
        default_pause_duration_days: PAUSE_CONFIG.DEFAULT_PAUSE_DAYS,
        max_total_pause_days_per_year: PAUSE_CONFIG.MAX_TOTAL_PAUSE_DAYS_PER_YEAR,
    };

    // If companyId provided, try to get company-specific config from database
    if (companyId) {
        try {
            const admin = getSupabaseAdmin();
            const { data: company } = await admin
                .from('companies')
                .select('subscription_max_pause_days, subscription_pause_limit_days')
                .eq('id', companyId)
                .maybeSingle();

            if (company) {
                return {
                    max_pause_duration_days: company.subscription_max_pause_days || PAUSE_CONFIG.DEFAULT_MAX_PAUSE_DAYS,
                    min_pause_duration_days: PAUSE_CONFIG.MIN_PAUSE_DAYS,
                    default_pause_duration_days: PAUSE_CONFIG.DEFAULT_PAUSE_DAYS,
                    max_total_pause_days_per_year: PAUSE_CONFIG.MAX_TOTAL_PAUSE_DAYS_PER_YEAR,
                };
            }
        } catch (error) {
            // Use defaults if DB lookup fails
            console.warn('Failed to fetch pause config, using defaults');
        }
    }

    return defaultConfig;
}

// Validate pause duration request
export async function validatePauseDuration(
    requestedDays: number | undefined,
    companyId: string,
    currentSubscriptionId: string
): Promise<{
    valid: boolean;
    approvedDays: number;
    error?: string;
    config?: PauseConfig;
}> {
    const config = await getPauseConfig(companyId);

    // Determine requested duration
    const requested = requestedDays ?? config.default_pause_duration_days;

    // Validate minimum
    if (requested < config.min_pause_duration_days) {
        return {
            valid: false,
            approvedDays: config.min_pause_duration_days,
            error: `Minimum pause duration is ${config.min_pause_duration_days} day(s)`,
            config,
        };
    }

    // Validate maximum per request
    if (requested > config.max_pause_duration_days) {
        return {
            valid: false,
            approvedDays: config.max_pause_duration_days,
            error: `Maximum pause duration per request is ${config.max_pause_duration_days} days. Please reduce your request.`,
            config,
        };
    }

    // Validate absolute maximum
    if (requested > PAUSE_CONFIG.MAX_PAUSE_DAYS) {
        return {
            valid: false,
            approvedDays: PAUSE_CONFIG.MAX_PAUSE_DAYS,
            error: `Absolute maximum pause duration is ${PAUSE_CONFIG.MAX_PAUSE_DAYS} days. Contact support for longer pauses.`,
            config,
        };
    }

    // Check total pause days used in current year
    const totalUsed = await getTotalPauseDaysThisYear(currentSubscriptionId);
    if (totalUsed + requested > config.max_total_pause_days_per_year) {
        const remaining = config.max_total_pause_days_per_year - totalUsed;
        return {
            valid: false,
            approvedDays: remaining > 0 ? remaining : 0,
            error: `You have used ${totalUsed} pause days this year. Maximum allowed is ${config.max_total_pause_days_per_year} days.`,
            config,
        };
    }

    return {
        valid: true,
        approvedDays: requested,
        config,
    };
}

// Get total pause days used this year
async function getTotalPauseDaysThisYear(subscriptionId: string): Promise<number> {
    const admin = getSupabaseAdmin();
    
    const startOfYear = new Date();
    startOfYear.setMonth(0);
    startOfYear.setDate(1);
    startOfYear.setHours(0, 0, 0, 0);

    // Calculate pause days from historical records
    const { data: pauseRecords } = await admin
        .from('subscription_pause_history')
        .select('pause_start_date, pause_end_date')
        .eq('subscription_id', subscriptionId)
        .gte('pause_start_date', startOfYear.toISOString());

    if (!pauseRecords || pauseRecords.length === 0) {
        return 0;
    }

    let totalDays = 0;
    for (const record of pauseRecords) {
        const start = new Date(record.pause_start_date);
        const end = record.pause_end_date 
            ? new Date(record.pause_end_date) 
            : new Date(); // If still paused, count from start to now

        const diffTime = end.getTime() - start.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        totalDays += Math.max(0, diffDays);
    }

    return totalDays;
}

// Calculate pause end date
export function calculatePauseEndDate(approvedDays: number): Date {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + approvedDays);
    return endDate;
}

// Format pause duration for response
export function formatPauseDurationResponse(
    approvedDays: number,
    pauseEndDate: Date,
    config: PauseConfig
): {
    duration_days: number;
    pause_end_date: string;
    max_duration_days: number;
    can_extend: boolean;
    message: string;
} {
    return {
        duration_days: approvedDays,
        pause_end_date: pauseEndDate.toISOString(),
        max_duration_days: config.max_pause_duration_days,
        can_extend: approvedDays < config.max_pause_duration_days,
        message: `Subscription paused for ${approvedDays} days. It will automatically resume on ${pauseEndDate.toISOString()}.`,
    };
}

// Create pause history record
export async function createPauseHistoryRecord(
    subscriptionId: string,
    companyId: string,
    pauseStartDate: Date,
    pauseEndDate: Date,
    reason?: string
): Promise<string> {
    const admin = getSupabaseAdmin();

    const { data: record, error } = await admin
        .from('subscription_pause_history')
        .insert({
            subscription_id: subscriptionId,
            company_id: companyId,
            pause_start_date: pauseStartDate.toISOString(),
            pause_end_date: pauseEndDate.toISOString(),
            reason: reason || 'User requested pause',
            created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

    if (error) {
        console.error('Failed to create pause history record:', error);
        throw BillingErrors.databaseError('Failed to record pause history');
    }

    return record.id;
}

// Validate and process pause request
export async function processPauseValidation(
    companyId: string,
    subscriptionId: string,
    request: PauseDurationRequest
): Promise<{
    valid: boolean;
    approvedDays: number;
    pauseEndDate: Date | null;
    error?: string;
    config?: PauseConfig;
}> {
    const validation = await validatePauseDuration(
        request.duration_days,
        companyId,
        subscriptionId
    );

    if (!validation.valid) {
        return {
            valid: false,
            approvedDays: 0,
            pauseEndDate: null,
            error: validation.error,
            config: validation.config,
        };
    }

    const pauseEndDate = calculatePauseEndDate(validation.approvedDays);

    return {
        valid: true,
        approvedDays: validation.approvedDays,
        pauseEndDate,
        config: validation.config,
    };
}

// Configuration UI helpers
export function getPauseConfigForUI(config: PauseConfig): {
    minDays: number;
    maxDays: number;
    defaultDays: number;
    yearlyLimit: number;
} {
    return {
        minDays: config.min_pause_duration_days,
        maxDays: config.max_pause_duration_days,
        defaultDays: config.default_pause_duration_days,
        yearlyLimit: config.max_total_pause_days_per_year,
    };
}
