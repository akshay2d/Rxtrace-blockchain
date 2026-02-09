# Subscription Billing System - Comprehensive Implementation Roadmap

This document provides a complete implementation roadmap for fixing subscription billing system blockers, structured in four phases with explicit tasks, code examples, file references, validation steps, and rollback procedures.

---

## Table of Contents

- [Phase 1: Critical Database Schema Fixes](#phase-1-critical-database-schema-fixes)
- [Phase 2: Core Billing Logic Implementation](#phase-2-core-billing-logic-implementation)
- [Phase 3: Access Control and Grace Period](#phase-3-access-control-and-grace-period)
- [Phase 4: Testing and Quality Assurance](#phase-4-testing-and-quality-assurance)
- [Validation Requirements](#validation-requirements)
- [Rollback Procedures](#rollback-procedures)

---

## Phase 1: Critical Database Schema Fixes

### Task 1.1: Create `webhook_events` Table Migration

**File:** [`supabase/migrations/20260226_webhook_events.sql`](supabase/migrations/20260226_webhook_events.sql)

**Purpose:** Create a dedicated table for tracking Razorpay webhook events to ensure idempotency and enable proper audit logging.

**Migration SQL:**
```sql
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL,
    event_type TEXT NOT NULL,
    entity_id TEXT,
    entity_type TEXT,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_status TEXT NOT NULL DEFAULT 'pending' 
        CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add unique constraint on idempotency_key
ALTER TABLE webhook_events 
    ADD CONSTRAINT webhook_events_idempotency_key_unique 
    UNIQUE (idempotency_key);

-- Indexes for performance
CREATE INDEX idx_webhook_events_idempotency 
ON webhook_events(idempotency_key) 
WHERE processing_status IN ('pending', 'processing', 'completed');

CREATE INDEX idx_webhook_events_entity 
ON webhook_events(entity_type, entity_id);

CREATE INDEX idx_webhook_events_type 
ON webhook_events(event_type, created_at DESC);
```

**Helper Function:**
```sql
CREATE OR REPLACE FUNCTION insert_webhook_event(
    p_idempotency_key TEXT, p_event_type TEXT, p_entity_id TEXT, 
    p_entity_type TEXT, p_payload JSONB
) RETURNS TABLE(event_id UUID, is_duplicate BOOLEAN, was_inserted BOOLEAN) AS $$
DECLARE v_event_id UUID; v_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM webhook_events 
        WHERE idempotency_key = p_idempotency_key
        AND processing_status IN ('completed', 'processing')
    ) INTO v_exists;
    
    IF v_exists THEN
        SELECT id, true, false INTO event_id, is_duplicate, was_inserted
        FROM webhook_events 
        WHERE idempotency_key = p_idempotency_key
        AND processing_status IN ('completed', 'processing')
        LIMIT 1;
        RETURN NEXT;
        RETURN;
    END IF;
    
    INSERT INTO webhook_events (
        idempotency_key, event_type, entity_id, entity_type, payload, processing_status
    ) VALUES (
        p_idempotency_key, p_event_type, p_entity_id, p_entity_type, p_payload, 'processing'
    )
    RETURNING id INTO v_event_id;
    
    RETURN QUERY SELECT v, true;
END_event_id, false;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Validation Steps:**
1. Verify table exists: `SELECT table_name FROM information_schema.tables WHERE table_name = 'webhook_events';`
2. Verify constraints: Check for `webhook_events_idempotency_key_unique` constraint
3. Verify indexes: `SELECT indexname FROM pg_indexes WHERE tablename = 'webhook_events';`

**Rollback:**
```sql
DROP TABLE IF EXISTS webhook_events CASCADE;
```

---

### Task 1.2: Add Missing Columns to `company_subscriptions`

**File:** [`supabase/migrations/20260227_subscription_columns.sql`](supabase/migrations/20260227_subscription_columns.sql)

**Purpose:** Add essential columns for tracking subscription lifecycle.

**Key Columns Added:**
- `plan_code TEXT` - Human-readable plan name
- `pending_payment_id TEXT` - Pending payment tracking
- `subscription_created_at TIMESTAMPTZ` - Subscription creation timestamp
- `subscription_activated_at TIMESTAMPTZ` - Activation timestamp
- `is_trial BOOLEAN DEFAULT false` - Trial flag
- `pause_end_date TIMESTAMPTZ` - Auto-resume date
- `grace_period_end TIMESTAMPTZ` - Grace period expiration

**Indexes:**
```sql
CREATE INDEX idx_company_subscriptions_plan_code ON company_subscriptions(plan_code) WHERE plan_code IS NOT NULL;
CREATE INDEX idx_company_subscriptions_pause_end ON company_subscriptions(pause_end_date) WHERE pause_end_date IS NOT NULL;
CREATE INDEX idx_company_subscriptions_grace_period ON company_subscriptions(grace_period_end) WHERE grace_period_end IS NOT NULL;
```

**Rollback:**
```sql
ALTER TABLE company_subscriptions 
    DROP COLUMN IF EXISTS grace_period_end CASCADE,
    DROP COLUMN IF EXISTS pause_end_date CASCADE,
    DROP COLUMN IF EXISTS is_trial CASCADE,
    DROP COLUMN IF EXISTS subscription_activated_at CASCADE,
    DROP COLUMN IF EXISTS subscription_created_at CASCADE,
    DROP COLUMN IF EXISTS pending_payment_id CASCADE,
    DROP COLUMN IF EXISTS plan_code CASCADE;
```

---

### Task 1.3: Add Explicit Webhook Event Handlers

**File:** [`lib/billing/subscription-webhook-handlers.ts`](lib/billing/subscription-webhook-handlers.ts)

**Handlers Implemented:**
- `handleSubscriptionActivated` - Handle subscription activation
- `handlePaymentFailed` - Handle payment failures
- `handleSubscriptionPaused` - Handle pause events
- `handleSubscriptionResumed` - Handle resume events
- `handleSubscriptionCancelled` - Handle cancellation events

**Example Handler (payment.failed):**
```typescript
export async function handlePaymentFailed(payload: any, correlationId: string) {
    const admin = getSupabaseAdmin();
    const entity = payload.payload?.payment?.entity;
    const paymentId = entity?.id;
    
    // Check idempotency
    const idempotencyKey = `webhook:${paymentId}:payment:payment_failed`;
    const { data: existingEvent } = await admin
        .from('webhook_events')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .eq('processing_status', 'completed')
        .maybeSingle();

    if (existingEvent) {
        console.log(`[${correlationId}] Duplicate payment.failed event skipped`);
        return { success: true };
    }

    // Store webhook event
    await admin.from('webhook_events').insert({
        idempotency_key: idempotencyKey,
        event_type: 'payment.failed',
        entity_id: paymentId,
        entity_type: 'payment',
        payload,
        processing_status: 'completed',
        processed_at: new Date().toISOString(),
    });

    // Update subscription
    if (entity?.notes?.company_id && entity?.subscription_id) {
        await admin.from('company_subscriptions')
            .update({ pending_payment_id: null })
            .eq('razorpay_subscription_id', entity.subscription_id);
    }

    return { success: true };
}
```

---

## Phase 2: Core Billing Logic Implementation

### Task 2.1: Implement Proration Logic

**File:** [`lib/billing/proration.ts`](lib/billing/proration.ts)

**Core Function:**
```typescript
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

    const prorationRatio = totalDaysInCycle > 0 ? remainingDays / totalDaysInCycle : 0;
    const oldDailyRate = oldPlanPrice / totalDaysInCycle;
    const newDailyRate = newPlanPrice / totalDaysInCycle;
    const unusedOldPlanCredit = oldDailyRate * remainingDays;
    const newPlanCost = newDailyRate * remainingDays;
    const netAmount = newPlanCost - unusedOldPlanCredit;

    let creditAmount = 0;
    let chargeAmount = 0;

    if (netAmount > 0) {
        chargeAmount = Math.round(netAmount);
    } else if (netAmount < 0) {
        creditAmount = Math.round(Math.abs(netAmount));
    }

    return { creditAmount, chargeAmount, prorationRatio, isZeroProration: creditAmount === 0 && chargeAmount === 0 };
}
```

**Usage in Upgrade Route:**
```typescript
// Before updating subscription at line 327 in upgrade/route.ts
const currentPeriodEnd = new Date(subscription.current_period_end);
const { remainingDays, isValid } = getRemainingDaysInCycle(currentPeriodEnd);
if (!isValid) {
    return NextResponse.json({ error: 'Billing period has ended' }, { status: 400 });
}

const totalDaysInCycle = getTotalDaysInCycle(billingCycleDb);
const proration = calculateProration(oldPlanPrice, newPlanPrice, remainingDays, totalDaysInCycle);

if (proration.chargeAmount > 0) {
    // Handle upgrade charge
}
```

**Unit Tests:**
```typescript
describe('calculateProration', () => {
    it('should calculate zero proration for same plan', () => {
        const result = calculateProration(10000, 10000, 15, 30);
        expect(result.isZeroProration).toBe(true);
    });

    it('should calculate upgrade charge', () => {
        const result = calculateProration(10000, 30000, 15, 30);
        expect(result.chargeAmount).toBeGreaterThan(0);
        expect(result.creditAmount).toBe(0);
    });

    it('should calculate downgrade credit', () => {
        const result = calculateProration(30000, 10000, 15, 30);
        expect(result.creditAmount).toBeGreaterThan(0);
        expect(result.chargeAmount).toBe(0);
    });

    it('should throw for negative prices', () => {
        expect(() => calculateProration(-100, 100, 15, 30)).toThrow();
    });
});
```

---

### Task 2.2: Automated Expiry Detection Cron Job

**File:** [`scripts/check-subscription-expiry.ts`](scripts/check-subscription-expiry.ts)

**Implementation Highlights:**
- Batch processes subscriptions (BATCH_SIZE = 100)
- Applies 7-day grace period configuration
- Sends expiry notification emails
- Revokes access after grace period ends

**Validation Steps:**
1. Test with mock subscriptions in staging
2. Verify subscriptions transition to EXPIRED status
3. Verify grace_period_end is set correctly
4. Verify emails are triggered
5. Test idempotency (running job twice should not duplicate work)

**Rollback:**
- Disable cron job in scheduler
- Manually revert subscription statuses:
  ```sql
  UPDATE company_subscriptions SET status = 'ACTIVE' WHERE status = 'EXPIRED';
  ```

---

### Task 2.3: Resume Functionality Handler

**File:** [`lib/billing/resume-handler.ts`](lib/billing/resume-handler.ts)

**Key Implementation:**
```typescript
export async function handleSubscriptionResume(
    companyId: string,
    subscriptionId: string
): Promise<ResumeResult> {
    // ... fetch subscription ...
    
    // Update local status to ACTIVE
    await admin.from('company_subscriptions')
        .update({
            status: 'ACTIVE',
            pause_end_date: null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id);

    // Attempt to sync with Razorpay
    const razorpayResult = await syncResumeToRazorpay(subscriptionId, companyId);

    // Alert admin when Razorpay sync fails
    if (!razorpayResult.success) {
        await alertAdminForManualResume({
            subscriptionId,
            companyId,
            attemptedAt: new Date().toISOString(),
            reason: razorpayResult.error,
        });
    }

    return result;
}

async function syncResumeToRazorpay(subscriptionId: string, companyId: string) {
    // Razorpay doesn't have a direct "resume" API
    // Try to remove pause_at if subscription is paused
    try {
        const subscription = await razorpay.subscriptions.fetch(subscriptionId);
        if (subscription.status === 'paused') {
            await razorpay.subscriptions.update(subscriptionId, { pause_at: 0 });
            return { success: true };
        }
        return { success: true }; // Already active
    } catch (error) {
        return { success: false, error: error.message };
    }
}
```

---

### Task 2.4: Rate Limiting Middleware

**File:** [`lib/middleware/rate-limit.ts`](lib/middleware/rate-limit.ts)

**Configuration:**
```typescript
// 10 requests per minute per company for subscription operations
export const subscriptionRateLimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '60 s'),
    analytics: true,
    prefix: 'subscription-rate-limit',
});

// 5 requests per minute for payment operations
export const paymentRateLimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '60 s'),
    analytics: true,
    prefix: 'payment-rate-limit',
});
```

**Usage in Routes:**
```typescript
export async function POST(req: Request) {
    // Apply rate limiting
    const rateLimitResult = await checkSubscriptionRateLimit(companyId, 'upgrade');
    if (!rateLimitResult.success) {
        return NextResponse.json({
            success: false,
            error: rateLimitResult.error,
            code: 'RATE_LIMIT_EXCEEDED',
            retry_after: rateLimitResult.resetTime,
        }, {
            status: 429,
            headers: {
                'Retry-After': rateLimitResult.resetTime.toString(),
                'X-RateLimit-Limit': rateLimitResult.limit.toString(),
                'X-RateLimit-Remaining': Math.max(0, rateLimitResult.remaining).toString(),
            },
        });
    }
    // ... continue with handler
}
```

---

### Task 2.5: Standardized Error Response Format

**File:** [`lib/billing/errors.ts`](lib/billing/errors.ts)

**Error Codes Enum:**
```typescript
export enum BillingErrorCode {
    UNAUTHORIZED = 'UNAUTHORIZED',
    FORBIDDEN = 'FORBIDDEN',
    INVALID_REQUEST = 'INVALID_REQUEST',
    RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
    INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
    PAYMENT_FAILED = 'PAYMENT_FAILED',
    SUBSCRIPTION_EXPIRED = 'SUBSCRIPTION_EXPIRED',
    SUBSCRIPTION_PAUSED = 'SUBSCRIPTION_PAUSED',
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
    RAZORPAY_ERROR = 'RAZORPAY_ERROR',
    INTERNAL_ERROR = 'INTERNAL_ERROR',
}
```

**Standardized Response:**
```typescript
interface BillingErrorResponse {
    success: boolean;
    error: string;
    code?: BillingErrorCode;
    correlationId?: string;
    details?: Record<string, any>;
    retryable?: boolean;
    retryAfter?: number;
    timestamp: string;
}

export function createErrorResponse(error: Error | BillingError): BillingErrorResponse {
    return {
        success: false,
        error: error.message,
        code: error instanceof BillingError ? error.code : BillingErrorCode.UNKNOWN_ERROR,
        correlationId: generateCorrelationId(),
        retryable: error instanceof BillingError ? error.retryable : false,
        timestamp: new Date().toISOString(),
    };
}
```

**Usage:**
```typescript
// In any billing route
try {
    // ... billing operation ...
} catch (error) {
    const response = createErrorResponse(error);
    console.error(`[BILLING ERROR] ${response.correlationId}`, response);
    return NextResponse.json(response, { status: getHttpStatusCode(response.code) });
}
```

---

## Phase 3: Access Control and Grace Period

### Task 3.1: Pause Duration Limits

**File:** [`lib/billing/pause-limits.ts`](lib/billing/pause-limits.ts)

**Configuration:**
```typescript
export const PAUSE_CONFIG = {
    DEFAULT_MAX_PAUSE_DAYS: 30,
    MIN_PAUSE_DAYS: 1,
    MAX_PAUSE_DAYS: 90,
    DEFAULT_PAUSE_DAYS: 7,
    MAX_TOTAL_PAUSE_DAYS_PER_YEAR: 90,
} as const;

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
    const requested = requestedDays ?? config.default_pause_duration_days;

    if (requested < config.min_pause_duration_days) {
        return { valid: false, approvedDays: config.min_pause_duration_days, 
            error: `Minimum pause duration is ${config.min_pause_duration_days} day(s)` };
    }

    if (requested > config.max_pause_duration_days) {
        return { valid: false, approvedDays: config.max_pause_duration_days,
            error: `Maximum pause duration per request is ${config.max_pause_duration_days} days` };
    }

    return { valid: true, approvedDays: requested, config };
}
```

**Integration in Pause Route:**
```typescript
// In app/api/billing/subscription/pause/route.ts
import { validatePauseDuration, calculatePauseEndDate } from '@/lib/billing/pause-limits';

export async function POST(req: Request) {
    const body = await req.json();
    const { duration_days } = body;

    const validation = await validatePauseDuration(duration_days, companyId, subscriptionId);
    if (!validation.valid) {
        return NextResponse.json({
            success: false,
            error: validation.error,
        }, { status: 400 });
    }

    const pauseEndDate = calculatePauseEndDate(validation.approvedDays);
    // ... continue with pause implementation
}
```

---

### Task 3.2: Grace Period Handling

**File:** [`lib/billing/grace-period.ts`](lib/billing/grace-period.ts)

**Configuration:**
```typescript
export const GRACE_PERIOD_CONFIG = {
    DEFAULT_GRACE_DAYS: 7,
    MAX_GRACE_DAYS: 30,
    TIER_BASIC_GRACE_DAYS: 3,
    TIER_STANDARD_GRACE_DAYS: 7,
    TIER_PREMIUM_GRACE_DAYS: 14,
    TIER_ENTERPRISE_GRACE_DAYS: 30,
} as const;

export function getGracePeriodDaysForTier(
    planCode?: string,
    isTrial: boolean = false
): number {
    if (isTrial) return 0;
    if (!planCode) return GRACE_PERIOD_CONFIG.DEFAULT_GRACE_DAYS;
    
    const lowerPlan = planCode.toLowerCase();
    if (lowerPlan.includes('enterprise')) return GRACE_PERIOD_CONFIG.TIER_ENTERPRISE_GRACE_DAYS;
    if (lowerPlan.includes('premium') || lowerPlan.includes('growth')) return GRACE_PERIOD_CONFIG.TIER_PREMIUM_GRACE_DAYS;
    if (lowerPlan.includes('starter')) return GRACE_PERIOD_CONFIG.TIER_BASIC_GRACE_DAYS;
    
    return GRACE_PERIOD_CONFIG.DEFAULT_GRACE_DAYS;
}
```

**Access Level During Grace Period:**
```typescript
export function getGracePeriodAccessLevel(
    subscriptionStatus: string,
    gracePeriodStatus: GracePeriodStatus,
    daysRemaining: number
): { level: 'full' | 'limited' | 'none'; features: string[]; restrictions: string[]; message: string } {
    if (gracePeriodStatus === GracePeriodStatus.ACTIVE) {
        return {
            level: 'limited',
            features: ['view', 'export', 'renew'],
            restrictions: ['Cannot create new shipments', 'Cannot purchase add-ons', 'Read-only access only'],
            message: `Grace period active with ${daysRemaining} day(s) remaining. Please renew.`,
        };
    }
    
    return {
        level: 'none',
        features: [],
        restrictions: ['All features disabled', 'Subscription expired'],
        message: 'Subscription has expired. Please renew to continue using the service.',
    };
}
```

---

### Task 3.3: Role-Based Access Control

**File:** [`lib/billing/access-control.ts`](lib/billing/access-control.ts)

**Role-Permission Mapping:**
```typescript
export enum BillingRole {
    OWNER = 'owner',
    ADMIN = 'admin',
    MEMBER = 'member',
    BILLING_MANAGER = 'billing_manager',
}

export enum BillingPermission {
    VIEW_SUBSCRIPTION = 'view_subscription',
    UPGRADE_PLAN = 'upgrade_plan',
    DOWNGRADE_PLAN = 'downgrade_plan',
    CANCEL_SUBSCRIPTION = 'cancel_subscription',
    PAUSE_SUBSCRIPTION = 'pause_subscription',
    RESUME_SUBSCRIPTION = 'resume_subscription',
    MANAGE_ADDONS = 'manage_addons',
    VIEW_INVOICES = 'view_invoices',
}

export const ROLE_PERMISSIONS: Record<BillingRole, BillingPermission[]> = {
    [BillingRole.OWNER]: Object.values(BillingPermission),
    [BillingRole.BILLING_MANAGER]: [
        BillingPermission.VIEW_SUBSCRIPTION,
        BillingPermission.UPGRADE_PLAN,
        BillingPermission.DOWNGRADE_PLAN,
        BillingPermission.PAUSE_SUBSCRIPTION,
        BillingPermission.RESUME_SUBSCRIPTION,
        BillingPermission.MANAGE_ADDONS,
        BillingPermission.VIEW_INVOICES,
    ],
    [BillingRole.ADMIN]: [
        BillingPermission.VIEW_SUBSCRIPTION,
        BillingPermission.VIEW_INVOICES,
    ],
    [BillingRole.MEMBER]: [
        BillingPermission.VIEW_SUBSCRIPTION,
        BillingPermission.VIEW_INVOICES,
    ],
};
```

**Authorization Middleware:**
```typescript
export async function authorizeBillingOperation(
    userId: string,
    companyId: string,
    requiredPermission: BillingPermission
): Promise<{ authorized: boolean; role?: BillingRole; error?: string }> {
    const roleInfo = await getUserBillingRole(userId, companyId);
    if (!roleInfo) return { authorized: false, error: 'Unable to determine user role' };

    const permissions = ROLE_PERMISSIONS[roleInfo.role] || [];
    if (!permissions.includes(requiredPermission)) {
        return { authorized: false, role: roleInfo.role, error: getPermissionDeniedMessage(requiredPermission, roleInfo.role) };
    }

    return { authorized: true, role: roleInfo.role };
}
```

---

## Phase 4: Testing and Quality Assurance

### Task 4.1: Comprehensive Test Suite

**Test Coverage Requirements:**
- New subscription creation
- Plan upgrade with proration
- Plan downgrade
- Subscription cancellation
- Subscription pause with duration limits
- Subscription resume
- Subscription expiry

**Edge Cases to Test:**
- Insufficient credits scenarios
- Network failures during API calls
- Concurrent modification attempts
- Idempotency handling
- Rate limit triggering

**Example Test Case:**
```typescript
describe('Subscription Flow', () => {
    it('should create new subscription and activate', async () => {
        const company = await createTestCompany();
        const subscription = await createSubscription(company.id, 'starter', 'monthly');
        
        expect(subscription.status).toBe('PENDING');
        
        // Simulate payment success webhook
        await handlePaymentSuccess({ subscription_id: subscription.id });
        
        const updated = await getSubscription(subscription.id);
        expect(updated.status).toBe('ACTIVE');
    });

    it('should reject pause exceeding duration limit', async () => {
        const subscription = await getActiveSubscription();
        
        await expect(pauseSubscription(subscription.id, 60))
            .rejects.toMatchObject({ 
                code: 'INVALID_REQUEST',
                error: 'Maximum pause duration per request is 30 days' 
            });
    });
});
```

---

### Task 4.2: Load Testing for Webhooks

**Load Test Scenarios:**
1. **Concurrent Webhook Events:** Simulate 1000 concurrent Razorpay webhook events
2. **Idempotency Under Load:** Verify duplicate events are correctly deduplicated
3. **Latency Under Load:** Verify P95 latency remains under 500ms
4. **Database Performance:** Verify webhook_events table handles concurrent inserts

**Load Test Script Example:**
```typescript
async function loadTestWebhookProcessing() {
    const events = [];
    for (let i = 0; i < 1000; i++) {
        events.push(generateMockWebhookEvent('payment.success', `pay_${i}`));
    }

    // Send concurrent requests
    const startTime = Date.now();
    const results = await Promise.allSettled(
        events.map(event => processWebhookEvent(event))
    );
    const duration = Date.now() - startTime;

    console.log(`Processed ${events.length} events in ${duration}ms`);
    console.log(`Success rate: ${results.filter(r => r.status === 'fulfilled').length / events.length}`);
    
    // Verify idempotency
    const duplicates = await checkDuplicateEvents();
    console.log(`Duplicate events detected: ${duplicates}`);
}
```

---

### Task 4.3: Security Audit

**Checklist:**
- [ ] Authorization checks cannot be bypassed
- [ ] Input validation prevents SQL injection
- [ ] Sensitive data not exposed in logs
- [ ] Rate limiting cannot be circumvented
- [ ] Webhook signature verification is implemented
- [ ] Error messages don't leak internal details

**Security Checks:**
```typescript
// 1. Verify webhook signature
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const crypto = require('crypto');
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
    return signature === expectedSignature;
}

// 2. Sanitize error responses
function sanitizeError(error: Error): BillingErrorResponse {
    // Don't expose internal error details to client
    return {
        success: false,
        error: 'An error occurred. Please contact support if the issue persists.',
        code: BillingErrorCode.INTERNAL_ERROR,
        timestamp: new Date().toISOString(),
    };
}
```

---

## Validation Requirements

### Phase 1 Completion Criteria
- [ ] Run migrations against staging database
- [ ] Verify all new columns and tables exist with correct schemas
- [ ] Test webhook handlers with simulated Razorpay events
- [ ] Confirm idempotency prevents duplicate processing

### Phase 2 Completion Criteria
- [ ] Test proration calculations with known inputs
- [ ] Verify expiry cron job correctly transitions subscriptions
- [ ] Confirm rate limiting triggers after limit exceeded
- [ ] Validate standardized error responses across all endpoints

### Phase 3 Completion Criteria
- [ ] Test pause functionality rejects requests exceeding duration limit
- [ ] Verify grace period allows continued access after current_period_end
- [ ] Confirm all access control checks work correctly

### Phase 4 Completion Criteria
- [ ] Achieve 90% test coverage on subscription-related code
- [ ] Pass load test with 1000 concurrent webhook events
- [ ] Pass security audit with no critical or high-severity findings

---

## Rollback Procedures Summary

### Database Migrations
```sql
-- Rollback webhook_events table
DROP TABLE IF EXISTS webhook_events CASCADE;

-- Rollback company_subscriptions columns
ALTER TABLE company_subscriptions 
    DROP COLUMN IF EXISTS grace_period_end CASCADE,
    DROP COLUMN IF EXISTS pause_end_date CASCADE,
    DROP COLUMN IF EXISTS is_trial CASCADE,
    DROP COLUMN IF EXISTS subscription_activated_at CASCADE,
    DROP COLUMN IF EXISTS subscription_created_at CASCADE,
    DROP COLUMN IF EXISTS pending_payment_id CASCADE,
    DROP COLUMN IF EXISTS plan_code CASCADE;
```

### Feature Flags
```typescript
// In config
export const FEATURE_FLAGS = {
    PRORATION_ENABLED: process.env.PRORATION_ENABLED === 'true',
    GRACE_PERIOD_ENABLED: process.env.GRACE_PERIOD_ENABLED === 'true',
    RATE_LIMITING_ENABLED: process.env.RATE_LIMITING_ENABLED === 'true',
};

// Use in routes
if (!FEATURE_FLAGS.PRORATION_ENABLED) {
    // Skip proration calculation
}
```

### Backup Strategy
1. Create database backup before each migration
2. Maintain previous version compatibility for at least one deployment cycle
3. Use feature flags to disable new functionality without code deployment

---

*Document Version: 1.0*  
*Last Updated: 2026-02-08*  
*Project: RxTrace Blockchain - Subscription Billing System*
