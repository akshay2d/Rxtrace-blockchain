// PHASE-8: Enhanced test utilities for subscription state machine and PENDING scenarios

import crypto from 'crypto';

// =============================================================================
// Mock Event Generators for PENDING Subscription Flow
// =============================================================================

/**
 * Create a mock subscription event for PENDING → ACTIVE activation testing
 */
export function createMockPendingActivationEvent(params: {
  subscriptionId?: string;
  companyId?: string;
  planId?: string;
  status?: 'pending' | 'active';
}): any {
  const subscriptionId = params.subscriptionId || `sub_test_${Date.now()}`;
  
  return {
    id: `evt_test_${Date.now()}`,
    event: 'subscription.activated',
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      subscription: {
        entity: {
          id: subscriptionId,
          status: params.status || 'active',
          plan_id: params.planId || `plan_test_${Date.now()}`,
          current_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
          cancel_at_cycle_end: false,
          notes: {
            company_id: params.companyId,
            source: 'billing_upgrade',
          },
        },
      },
    },
  };
}

/**
 * Create a mock payment captured event for PENDING activation
 */
export function createMockPaymentForPendingActivation(params: {
  paymentId?: string;
  orderId?: string;
  subscriptionId?: string;
  companyId?: string;
  amount?: number;
}): any {
  const paymentId = params.paymentId || `pay_test_${Date.now()}`;
  const orderId = params.orderId || `order_test_${Date.now()}`;
  
  return {
    id: `evt_test_${Date.now()}`,
    event: 'payment.captured',
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: orderId,
          amount: (params.amount || 1000) * 100, // Convert to paise
          currency: 'INR',
          status: 'captured',
          notes: {
            subscription_id: params.subscriptionId,
            company_id: params.companyId,
          },
        },
      },
    },
  };
}

/**
 * Create a mock order paid event for PENDING activation
 */
export function createMockOrderPaidForPendingActivation(params: {
  orderId?: string;
  paymentId?: string;
  subscriptionId?: string;
  companyId?: string;
  amount?: number;
}): any {
  const orderId = params.orderId || `order_test_${Date.now()}`;
  const paymentId = params.paymentId || `pay_test_${Date.now()}`;
  
  return {
    id: `evt_test_${Date.now()}`,
    event: 'order.paid',
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: orderId,
          amount: (params.amount || 1000) * 100,
          currency: 'INR',
          status: 'captured',
        },
      },
    },
  };
}

// =============================================================================
// Mock Database Helpers for PENDING Scenarios
// =============================================================================

export interface MockSubscriptionRecord {
  id: string;
  company_id: string;
  plan_id: string | null;
  status: string;
  razorpay_subscription_id: string | null;
  pending_payment_id: string | null;
  subscription_created_at: string | null;
  subscription_activated_at: string | null;
  current_period_end: string | null;
}

export function createMockPendingSubscription(params: {
  id?: string;
  companyId?: string;
  planId?: string;
  razorpaySubscriptionId?: string;
}): MockSubscriptionRecord {
  const id = params.id || `sub_rec_${Date.now()}`;
  const now = new Date().toISOString();
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  
  return {
    id,
    company_id: params.companyId || '123e4567-e89b-12d3-a456-426614174000',
    plan_id: params.planId || 'plan_starter_monthly',
    status: 'PENDING',
    razorpay_subscription_id: params.razorpaySubscriptionId || `sub_test_${Date.now()}`,
    pending_payment_id: params.razorpaySubscriptionId || `sub_test_${Date.now()}`,
    subscription_created_at: now,
    subscription_activated_at: null,
    current_period_end: periodEnd.toISOString(),
  };
}

export function activateMockSubscription(record: MockSubscriptionRecord): MockSubscriptionRecord {
  return {
    ...record,
    status: 'ACTIVE',
    subscription_activated_at: new Date().toISOString(),
    pending_payment_id: null,
  };
}

// =============================================================================
// State Machine Test Helpers
// =============================================================================

import { 
  isValidTransition, 
  getTransitionDescription,
  getFeaturesForStatus,
  getStatusColor,
  SubscriptionStatus 
} from './state-machine';

/**
 * Test helper to validate all possible transitions
 */
export function getAllowedTransitions(fromStatus: SubscriptionStatus): SubscriptionStatus[] {
  const transitionMap: Record<SubscriptionStatus, SubscriptionStatus[]> = {
    'TRIAL': ['trialing', 'ACTIVE', 'PENDING', 'EXPIRED'],
    'trialing': ['TRIAL', 'ACTIVE', 'PENDING', 'EXPIRED'],
    'PENDING': ['ACTIVE', 'CANCELLED', 'EXPIRED'],
    'ACTIVE': ['PAUSED', 'CANCELLED', 'EXPIRED', 'PENDING'],
    'PAUSED': ['ACTIVE', 'CANCELLED', 'EXPIRED'],
    'CANCELLED': ['ACTIVE', 'PENDING'],
    'EXPIRED': ['ACTIVE', 'PENDING', 'TRIAL'],
  };
  return transitionMap[fromStatus] || [];
}

/**
 * Test helper to validate state transition
 */
export function expectValidTransition(fromStatus: SubscriptionStatus, toStatus: SubscriptionStatus): void {
  const allowed = getAllowedTransitions(fromStatus);
  if (!allowed.includes(toStatus)) {
    throw new Error(
      `Invalid transition: ${fromStatus} → ${toStatus}. ` +
      `Allowed transitions from ${fromStatus}: ${allowed.join(', ')}`
    );
  }
}

/**
 * Test helper to validate invalid state transition
 */
export function expectInvalidTransition(fromStatus: SubscriptionStatus, toStatus: SubscriptionStatus): void {
  const allowed = getAllowedTransitions(fromStatus);
  if (allowed.includes(toStatus)) {
    throw new Error(
      `Expected invalid transition but ${fromStatus} → ${toStatus} is allowed`
    );
  }
}

// =============================================================================
// Webhook Signature Generation for Tests
// =============================================================================

export function generateTestWebhookSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function createTestWebhookRequest(
  event: any, 
  secret: string = 'test_webhook_secret'
): {
  body: string;
  signature: string;
  headers: Record<string, string>;
} {
  const body = JSON.stringify(event);
  const signature = generateTestWebhookSignature(body, secret);
  
  return {
    body,
    signature,
    headers: {
      'x-razorpay-signature': signature,
      'content-type': 'application/json',
    },
  };
}

// =============================================================================
// Test Fixtures
// =============================================================================

export const SUBSCRIPTION_TEST_FIXTURES = {
  // Status transitions
  validTransitions: [
    { from: 'TRIAL', to: 'ACTIVE', description: 'Trial to active' },
    { from: 'TRIAL', to: 'PENDING', description: 'Trial to pending (upgrade started)' },
    { from: 'PENDING', to: 'ACTIVE', description: 'Pending to active (payment confirmed)' },
    { from: 'ACTIVE', to: 'PAUSED', description: 'Active to paused' },
    { from: 'ACTIVE', to: 'CANCELLED', description: 'Active to cancelled' },
    { from: 'PAUSED', to: 'ACTIVE', description: 'Paused to active (resume)' },
    { from: 'CANCELLED', to: 'ACTIVE', description: 'Cancelled to active (reactivate)' },
  ],
  
  invalidTransitions: [
    { from: 'PENDING', to: 'PAUSED', reason: 'Cannot pause pending subscription' },
    { from: 'EXPIRED', to: 'PAUSED', reason: 'Cannot pause expired subscription' },
    { from: 'CANCELLED', to: 'PAUSED', reason: 'Cannot pause cancelled subscription' },
    { from: 'EXPIRED', to: 'EXPIRED', reason: 'Already expired' },
  ],
  
  // Company IDs
  testCompanies: {
    valid: '123e4567-e89b-12d3-a456-426614174000',
    invalid: 'not-a-uuid',
    empty: '',
  },
  
  // Subscription IDs
  testSubscriptions: {
    pending: 'sub_test_pending_123',
    active: 'sub_test_active_456',
    cancelled: 'sub_test_cancelled_789',
    razorpay: 'sub_razorpay_123',
  },
};

// =============================================================================
// Assertion Helpers
// =============================================================================

export function assertSubscriptionStatus(
  actualStatus: string, 
  expectedStatus: string,
  message?: string
): void {
  if (actualStatus !== expectedStatus) {
    throw new Error(
      (message || `Expected subscription status to be ${expectedStatus}, got ${actualStatus}`)
    );
  }
}

export function assertPendingSubscriptionHasPaymentId(
  subscription: MockSubscriptionRecord,
  expectedPaymentId: string
): void {
  if (subscription.status !== 'PENDING') {
    throw new Error(`Expected PENDING status, got ${subscription.status}`);
  }
  if (subscription.pending_payment_id !== expectedPaymentId) {
    throw new Error(
      `Expected pending_payment_id to be ${expectedPaymentId}, got ${subscription.pending_payment_id}`
    );
  }
}

export function assertActivatedSubscription(
  subscription: MockSubscriptionRecord
): void {
  if (subscription.status !== 'ACTIVE') {
    throw new Error(`Expected ACTIVE status, got ${subscription.status}`);
  }
  if (!subscription.subscription_activated_at) {
    throw new Error('Expected subscription_activated_at to be set');
  }
  if (subscription.pending_payment_id !== null) {
    throw new Error(`Expected pending_payment_id to be null, got ${subscription.pending_payment_id}`);
  }
}
