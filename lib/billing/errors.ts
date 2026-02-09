// Standardized Error Response System
// Phase 2: Core Billing Logic Implementation
// Task 2.5: Standardize error response format

// Error codes enum
export enum BillingErrorCode {
    // Authentication/Authorization
    UNAUTHORIZED = 'UNAUTHORIZED',
    FORBIDDEN = 'FORBIDDEN',
    
    // Validation
    INVALID_REQUEST = 'INVALID_REQUEST',
    MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
    INVALID_FIELD_VALUE = 'INVALID_FIELD_VALUE',
    
    // Resources
    RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
    RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
    
    // Billing
    INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
    PAYMENT_FAILED = 'PAYMENT_FAILED',
    SUBSCRIPTION_NOT_ACTIVE = 'SUBSCRIPTION_NOT_ACTIVE',
    PLAN_UPGRADE_FAILED = 'PLAN_UPGRADE_FAILED',
    PLAN_DOWNGRADE_FAILED = 'PLAN_DOWNGRADE_FAILED',
    PRORATION_FAILED = 'PRORATION_FAILED',
    SUBSCRIPTION_EXPIRED = 'SUBSCRIPTION_EXPIRED',
    SUBSCRIPTION_PAUSED = 'SUBSCRIPTION_PAUSED',
    
    // Rate Limiting
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
    
    // Razorpay
    RAZORPAY_ERROR = 'RAZORPAY_ERROR',
    RAZORPAY_SYNC_FAILED = 'RAZORPAY_SYNC_FAILED',
    
    // System
    INTERNAL_ERROR = 'INTERNAL_ERROR',
    EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
    DATABASE_ERROR = 'DATABASE_ERROR',
    UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// Standardized error response interface
export interface BillingErrorResponse {
    success: boolean;
    error: string;
    code?: BillingErrorCode;
    correlationId?: string;
    details?: Record<string, any>;
    retryable?: boolean;
    retryAfter?: number;
    timestamp: string;
}

// Billing error class
export class BillingError extends Error {
    code: BillingErrorCode;
    correlationId?: string;
    details?: Record<string, any>;
    retryable: boolean;
    retryAfter?: number;

    constructor(
        message: string,
        code: BillingErrorCode,
        options?: {
            correlationId?: string;
            details?: Record<string, any>;
            retryable?: boolean;
            retryAfter?: number;
        }
    ) {
        super(message);
        this.name = 'BillingError';
        this.code = code;
        this.correlationId = options?.correlationId;
        this.details = options?.details;
        this.retryable = options?.retryable ?? false;
        this.retryAfter = options?.retryAfter;
    }
}

// Generate correlation ID for request tracking
export function generateCorrelationId(): string {
    return `bill_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

// Create standardized error response
export function createErrorResponse(error: Error | BillingError): BillingErrorResponse {
    const correlationId = error instanceof BillingError ? error.correlationId : generateCorrelationId();
    const timestamp = new Date().toISOString();

    if (error instanceof BillingError) {
        return {
            success: false,
            error: error.message,
            code: error.code,
            correlationId,
            details: error.details,
            retryable: error.retryable,
            retryAfter: error.retryAfter,
            timestamp,
        };
    }

    return {
        success: false,
        error: error.message || 'An unexpected error occurred',
        code: BillingErrorCode.UNKNOWN_ERROR,
        correlationId,
        retryable: false,
        timestamp,
    };
}

// Create success response with data
export function createSuccessResponse<T>(data: T, correlationId?: string): {
    success: true;
    data: T;
    correlationId?: string;
    timestamp: string;
} {
    return {
        success: true,
        data,
        correlationId,
        timestamp: new Date().toISOString(),
    };
}

// Map error codes to HTTP status codes
export function getHttpStatusCode(code?: BillingErrorCode): number {
    switch (code) {
        case BillingErrorCode.UNAUTHORIZED:
            return 401;
        case BillingErrorCode.FORBIDDEN:
            return 403;
        case BillingErrorCode.RESOURCE_NOT_FOUND:
            return 404;
        case BillingErrorCode.INVALID_REQUEST:
        case BillingErrorCode.MISSING_REQUIRED_FIELD:
        case BillingErrorCode.INVALID_FIELD_VALUE:
            return 400;
        case BillingErrorCode.RATE_LIMIT_EXCEEDED:
            return 429;
        case BillingErrorCode.INSUFFICIENT_CREDITS:
            return 402;
        default:
            return 500;
    }
}

// Create Next.js response from error
export function createErrorResponseJson(error: Error | BillingError): {
    json: () => BillingErrorResponse;
    status: number;
    headers?: Record<string, string>;
} {
    const response = createErrorResponse(error);
    const status = getHttpStatusCode(response.code);

    return {
        json: () => response,
        status,
    };
}

// Helper to wrap async operations with error handling
export async function withBillingErrorHandling<T>(
    operation: () => Promise<T>,
    options?: {
        correlationId?: string;
        defaultError?: string;
        fallbackCode?: BillingErrorCode;
    }
): Promise<{ success: true; data: T } | { success: false; error: BillingErrorResponse }> {
    const correlationId = options?.correlationId || generateCorrelationId();
    
    try {
        const data = await operation();
        return { success: true, data };
    } catch (error) {
        const response = createErrorResponse(
            error instanceof Error ? error : new Error(options?.defaultError || 'Operation failed')
        );
        response.correlationId = correlationId;
        return { success: false, error: response };
    }
}

// Error logging with correlation ID
export function logBillingError(
    error: BillingErrorResponse,
    context?: Record<string, any>
): void {
    console.error(`[BILLING ERROR] ${error.correlationId}`, {
        code: error.code,
        error: error.error,
        retryable: error.retryable,
        retryAfter: error.retryAfter,
        details: error.details,
        context,
        timestamp: error.timestamp,
    });
}

// Common error factory functions
export const BillingErrors = {
    unauthorized(message: string = 'Unauthorized access'): BillingError {
        return new BillingError(message, BillingErrorCode.UNAUTHORIZED);
    },

    forbidden(message: string = 'Access forbidden'): BillingError {
        return new BillingError(message, BillingErrorCode.FORBIDDEN);
    },

    notFound(resource: string): BillingError {
        return new BillingError(`${resource} not found`, BillingErrorCode.RESOURCE_NOT_FOUND);
    },

    invalidRequest(message: string): BillingError {
        return new BillingError(message, BillingErrorCode.INVALID_REQUEST);
    },

    subscriptionNotActive(): BillingError {
        return new BillingError(
            'No active subscription found',
            BillingErrorCode.SUBSCRIPTION_NOT_ACTIVE
        );
    },

    subscriptionExpired(): BillingError {
        return new BillingError(
            'Subscription has expired',
            BillingErrorCode.SUBSCRIPTION_EXPIRED,
            { retryable: true, retryAfter: 3600 }
        );
    },

    subscriptionPaused(): BillingError {
        return new BillingError(
            'Subscription is paused',
            BillingErrorCode.SUBSCRIPTION_PAUSED
        );
    },

    insufficientCredits(): BillingError {
        return new BillingError(
            'Insufficient wallet credits',
            BillingErrorCode.INSUFFICIENT_CREDITS
        );
    },

    paymentFailed(message: string): BillingError {
        return new BillingError(
            `Payment failed: ${message}`,
            BillingErrorCode.PAYMENT_FAILED,
            { retryable: true, retryAfter: 60 }
        );
    },

    razorpayError(message: string, details?: Record<string, any>): BillingError {
        return new BillingError(
            `Razorpay error: ${message}`,
            BillingErrorCode.RAZORPAY_ERROR,
            { details, retryable: true, retryAfter: 60 }
        );
    },

    databaseError(message: string): BillingError {
        return new BillingError(
            `Database error: ${message}`,
            BillingErrorCode.DATABASE_ERROR,
            { retryable: true, retryAfter: 30 }
        );
    },

    internalError(message: string = 'An internal error occurred'): BillingError {
        return new BillingError(message, BillingErrorCode.INTERNAL_ERROR, {
            retryable: false,
        });
    },

    rateLimitExceeded(retryAfter?: number): BillingError {
        return new BillingError(
            'Rate limit exceeded. Please try again later.',
            BillingErrorCode.RATE_LIMIT_EXCEEDED,
            { retryable: true, retryAfter: retryAfter || 60 }
        );
    },
};
