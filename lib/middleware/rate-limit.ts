// Rate Limiting Middleware for Billing Endpoints
// Phase 2: Core Billing Logic Implementation
// Task 2.4: Implement rate limiting middleware

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

// Initialize Redis client
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Create rate limiter: 10 requests per minute per company
export const subscriptionRateLimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '60 s'),
    analytics: true,
    prefix: 'subscription-rate-limit',
});

// Create stricter rate limiter for payment operations: 5 requests per minute
export const paymentRateLimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '60 s'),
    analytics: true,
    prefix: 'payment-rate-limit',
});

// Rate limit result interface
export interface RateLimitResult {
    success: boolean;
    remaining: number;
    resetTime: number;
    limit: number;
    error?: string;
}

/**
 * Check rate limit for subscription operations
 */
export async function checkSubscriptionRateLimit(
    companyId: string,
    endpoint: string = 'general'
): Promise<RateLimitResult> {
    const identifier = `${companyId}:${endpoint}`;
    const result = await subscriptionRateLimit.limit(identifier);

    if (!result.success) {
        return {
            success: false,
            remaining: result.remaining,
            resetTime: result.reset,
            limit: 10,
            error: 'Rate limit exceeded. Please try again later.',
        };
    }

    return {
        success: true,
        remaining: result.remaining,
        resetTime: result.reset,
        limit: 10,
    };
}

/**
 * Check rate limit for payment operations
 */
export async function checkPaymentRateLimit(
    companyId: string,
    paymentId: string
): Promise<RateLimitResult> {
    const identifier = `${companyId}:payment:${paymentId}`;
    const result = await paymentRateLimit.limit(identifier);

    if (!result.success) {
        return {
            success: false,
            remaining: result.remaining,
            resetTime: result.reset,
            limit: 5,
            error: 'Too many payment requests. Please wait before retrying.',
        };
    }

    return {
        success: true,
        remaining: result.remaining,
        resetTime: result.reset,
        limit: 5,
    };
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': Math.max(0, result.remaining).toString(),
        'X-RateLimit-Reset': result.resetTime.toString(),
    };
}

/**
 * Create rate-limited response
 */
export function createRateLimitedResponse(result: RateLimitResult): NextResponse {
    return NextResponse.json(
        {
            success: false,
            error: result.error,
            code: 'RATE_LIMIT_EXCEEDED',
            retry_after: result.resetTime,
            rate_limit: {
                limit: result.limit,
                remaining: Math.max(0, result.remaining),
                reset_at: new Date(result.resetTime * 1000).toISOString(),
            },
        },
        {
            status: 429,
            headers: {
                'Retry-After': result.resetTime.toString(),
                ...getRateLimitHeaders(result),
            },
        }
    );
}

/**
 * Middleware helper to apply rate limiting to API routes
 */
export async function applyRateLimit(
    request: Request,
    companyId: string,
    endpoint: string
): Promise<NextResponse | null> {
    const result = await checkSubscriptionRateLimit(companyId, endpoint);

    if (!result.success) {
        return createRateLimitedResponse(result);
    }

    return null; // Continue to handler
}

/**
 * Apply rate limiting to Next.js API route
 * Call this at the beginning of your route handler
 */
export async function withRateLimit(
    request: Request,
    companyId: string,
    options?: {
        endpoint?: string;
        strict?: boolean; // Use stricter payment rate limit
    }
): Promise<{ allowed: boolean; response?: NextResponse; rateInfo?: RateLimitResult }> {
    const endpoint = options?.endpoint || 'general';
    let result: RateLimitResult;

    if (options?.strict) {
        result = await checkPaymentRateLimit(companyId, endpoint);
    } else {
        result = await checkSubscriptionRateLimit(companyId, endpoint);
    }

    if (!result.success) {
        return {
            allowed: false,
            response: createRateLimitedResponse(result),
        };
    }

    return {
        allowed: true,
        rateInfo: result,
    };
}

/**
 * Apply rate limit and get headers for response
 */
export async function applyRateLimitWithHeaders(
    request: Request,
    companyId: string,
    endpoint: string = 'general'
): Promise<{ allowed: boolean; headers?: Record<string, string>; response?: NextResponse }> {
    const result = await checkSubscriptionRateLimit(companyId, endpoint);

    if (!result.success) {
        return {
            allowed: false,
            response: createRateLimitedResponse(result),
        };
    }

    return {
        allowed: true,
        headers: getRateLimitHeaders(result),
    };
}

// Fallback rate limiter using in-memory storage (for development without Redis)
const memoryRateLimit = new Map<string, { count: number; resetTime: number }>();

export function checkMemoryRateLimit(
    companyId: string,
    limit: number = 10,
    windowMs: number = 60000 // 1 minute
): RateLimitResult {
    const key = `${companyId}:memory`;
    const now = Date.now();

    const current = memoryRateLimit.get(key);

    if (!current || current.resetTime < now) {
        // Reset or new entry
        memoryRateLimit.set(key, {
            count: 1,
            resetTime: now + windowMs,
        });
        return {
            success: true,
            remaining: limit - 1,
            resetTime: Math.ceil((now + windowMs) / 1000),
            limit,
        };
    }

    if (current.count >= limit) {
        return {
            success: false,
            remaining: 0,
            resetTime: Math.ceil(current.resetTime / 1000),
            limit,
            error: 'Rate limit exceeded. Please try again later.',
        };
    }

    // Increment count
    current.count++;
    memoryRateLimit.set(key, current);

    return {
        success: true,
        remaining: limit - current.count,
        resetTime: Math.ceil(current.resetTime / 1000),
        limit,
    };
}

/**
 * Use memory rate limiter as fallback if Redis is not configured
 */
export async function checkRateLimitWithFallback(
    companyId: string,
    endpoint: string = 'general'
): Promise<RateLimitResult> {
    // Check if Redis is configured
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        return checkSubscriptionRateLimit(companyId, endpoint);
    }

    // Use memory fallback
    return checkMemoryRateLimit(companyId, 10, 60000);
}
