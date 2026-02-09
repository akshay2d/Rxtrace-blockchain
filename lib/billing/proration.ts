// Proration Calculation Helper Functions
// Phase 2: Core Billing Logic Implementation
// Task 2.1: Implement proration logic

/**
 * Calculate proration for plan upgrade/downgrade
 * @param oldPlanPrice - Current plan price in paise
 * @param newPlanPrice - New plan price in paise
 * @param remainingDays - Days remaining in current billing cycle
 * @param totalDaysInCycle - Total days in billing cycle
 * @returns Proration calculation result
 */
export function calculateProration(
    oldPlanPrice: number,      // Price in paise
    newPlanPrice: number,       // Price in paise
    remainingDays: number,     // Days remaining in billing cycle
    totalDaysInCycle: number    // Total days in billing cycle
): {
    creditAmount: number;       // Amount to credit (positive = credit to customer)
    chargeAmount: number;       // Amount to charge (positive = charge to customer)
    prorationRatio: number;    // Ratio used for calculation
    isZeroProration: boolean;  // True if no proration needed
} {
    // Validate inputs
    if (oldPlanPrice < 0 || newPlanPrice < 0) {
        throw new Error('Plan prices cannot be negative');
    }
    if (remainingDays < 0 || totalDaysInCycle <= 0) {
        throw new Error('Invalid day calculations');
    }
    if (remainingDays > totalDaysInCycle) {
        throw new Error('Remaining days cannot exceed total days in cycle');
    }

    // Calculate proration ratio
    const prorationRatio = totalDaysInCycle > 0 ? remainingDays / totalDaysInCycle : 0;

    // Calculate daily rates
    const oldDailyRate = oldPlanPrice / totalDaysInCycle;
    const newDailyRate = newPlanPrice / totalDaysInCycle;

    // Calculate unused portion of old plan (credit to customer)
    const unusedOldPlanCredit = oldDailyRate * remainingDays;

    // Calculate cost of new plan for remaining period (charge to customer)
    const newPlanCost = newDailyRate * remainingDays;

    // Net amount: positive = charge, negative = credit
    const netAmount = newPlanCost - unusedOldPlanCredit;

    // Determine credit and charge amounts
    let creditAmount = 0;
    let chargeAmount = 0;

    if (netAmount > 0) {
        // New plan is more expensive - charge the difference
        chargeAmount = Math.round(netAmount);
    } else if (netAmount < 0) {
        // Old plan is more expensive - credit the difference
        creditAmount = Math.round(Math.abs(netAmount));
    }

    return {
        creditAmount,
        chargeAmount,
        prorationRatio: Math.round(prorationRatio * 10000) / 10000, // 4 decimal places
        isZeroProration: creditAmount === 0 && chargeAmount === 0,
    };
}

/**
 * Enhanced proration function with detailed breakdown
 */
export function calculateProrationDetailed(
    oldPlanPrice: number,
    newPlanPrice: number,
    remainingDays: number,
    totalDaysInCycle: number
): {
    creditAmount: number;
    chargeAmount: number;
    prorationRatio: number;
    isZeroProration: boolean;
    breakdown: {
        oldPlanDailyRate: number;
        newPlanDailyRate: number;
        unusedOldPlanValue: number;
        newPlanCost: number;
        remainingDays: number;
        totalDaysInCycle: number;
    };
} {
    const result = calculateProration(
        oldPlanPrice,
        newPlanPrice,
        remainingDays,
        totalDaysInCycle
    );

    const oldDailyRate = oldPlanPrice / totalDaysInCycle;
    const newDailyRate = newPlanPrice / totalDaysInCycle;

    return {
        ...result,
        breakdown: {
            oldPlanDailyRate: Math.round(oldDailyRate),
            newPlanDailyRate: Math.round(newDailyRate),
            unusedOldPlanValue: Math.round(oldDailyRate * remainingDays),
            newPlanCost: Math.round(newDailyRate * remainingDays),
            remainingDays,
            totalDaysInCycle,
        },
    };
}

/**
 * Calculate days remaining in billing cycle
 */
export function getRemainingDaysInCycle(currentPeriodEnd: Date): {
    remainingDays: number;
    isValid: boolean;
    error?: string;
} {
    const now = new Date();
    
    if (currentPeriodEnd <= now) {
        return {
            remainingDays: 0,
            isValid: false,
            error: 'Billing period has already ended',
        };
    }

    const diffTime = currentPeriodEnd.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
        remainingDays: diffDays,
        isValid: true,
    };
}

/**
 * Get total days in billing cycle based on billing frequency
 */
export function getTotalDaysInCycle(billingCycle: 'monthly' | 'yearly' | 'quarterly'): number {
    switch (billingCycle) {
        case 'yearly':
            return 365;
        case 'quarterly':
            return 90;
        case 'monthly':
        default:
            return 30;
    }
}

/**
 * Format proration result for API response
 */
export function formatProrationForResponse(
    proration: ReturnType<typeof calculateProration>,
    currency: string = 'INR'
): {
    creditAmount: number;
    creditAmountFormatted: string;
    chargeAmount: number;
    chargeAmountFormatted: string;
    prorationPercentage: string;
    isZeroProration: boolean;
} {
    const formatAmount = (amount: number) => {
        return `${currency} ${(amount / 100).toFixed(2)}`;
    };

    return {
        creditAmount: proration.creditAmount,
        creditAmountFormatted: formatAmount(proration.creditAmount),
        chargeAmount: proration.chargeAmount,
        chargeAmountFormatted: formatAmount(proration.chargeAmount),
        prorationPercentage: `${(proration.prorationRatio * 100).toFixed(2)}%`,
        isZeroProration: proration.isZeroProration,
    };
}

/**
 * Apply proration credit to company wallet
 */
export async function applyProrationCredit(
    companyId: string,
    creditAmount: number,
    reason: string
): Promise<{ success: boolean; walletBalance?: number; error?: string }> {
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
    const admin = getSupabaseAdmin();

    // Add credit to company wallet
    const { data: wallet, error } = await admin
        .rpc('wallet_add_credit', {
            p_company_id: companyId,
            p_amount: creditAmount,
            p_reason: reason,
        })
        .single();

    if (error) {
        return {
            success: false,
            error: error.message,
        };
    }

    return {
        success: true,
        walletBalance: wallet?.balance || 0,
    };
}

/**
 * Complete proration calculation and application for plan upgrade
 */
export async function processPlanUpgradeProration(params: {
    companyId: string;
    oldPlanPrice: number;      // In paise
    newPlanPrice: number;       // In paise
    currentPeriodEnd: Date;
    billingCycle: 'monthly' | 'yearly' | 'quarterly';
    creditWallet?: boolean;     // Whether to credit wallet (true for downgrade)
}): Promise<{
    success: boolean;
    proration?: ReturnType<typeof calculateProration>;
    error?: string;
    creditApplied?: boolean;
    walletBalance?: number;
}> {
    const { remainingDays, isValid, error: daysError } = getRemainingDaysInCycle(params.currentPeriodEnd);
    
    if (!isValid) {
        return {
            success: false,
            error: daysError,
        };
    }

    const totalDaysInCycle = getTotalDaysInCycle(params.billingCycle);
    const proration = calculateProration(
        params.oldPlanPrice,
        params.newPlanPrice,
        remainingDays,
        totalDaysInCycle
    );

    // If no proration needed
    if (proration.isZeroProration) {
        return {
            success: true,
            proration,
        };
    }

    // If downgrade with credit
    if (proration.creditAmount > 0 && params.creditWallet) {
        const creditResult = await applyProrationCredit(
            params.companyId,
            proration.creditAmount,
            `Plan change credit: ${remainingDays} days remaining in ${params.billingCycle} cycle`
        );

        if (!creditResult.success) {
            return {
                success: false,
                error: `Failed to apply credit: ${creditResult.error}`,
                proration,
            };
        }

        return {
            success: true,
            proration,
            creditApplied: true,
            walletBalance: creditResult.walletBalance,
        };
    }

    // If upgrade with charge, return proration info for payment flow
    return {
        success: true,
        proration,
    };
}
