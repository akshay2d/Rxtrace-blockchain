// PHASE-8: Testing utilities for webhook handler
// This file provides test helpers, mocks, and fixtures for testing the Razorpay webhook handler

import crypto from "crypto";

// PHASE-8: Test configuration
export const TEST_CONFIG = {
  webhookSecret: 'test_webhook_secret_key_for_testing_only',
  maxPayloadSize: 10 * 1024 * 1024, // 10MB
};

// PHASE-8: Generate valid webhook signature for testing
export function generateTestWebhookSignature(payload: string, secret: string = TEST_CONFIG.webhookSecret): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

// PHASE-8: Mock webhook event generators
export function createMockInvoiceEvent(params: {
  invoiceId?: string;
  subscriptionId?: string;
  companyId?: string;
  amount?: number;
  status?: 'paid' | 'issued' | 'cancelled';
  eventType?: 'invoice.paid' | 'invoice.issued' | 'invoice.cancelled';
}): any {
  const invoiceId = params.invoiceId || `inv_test_${Date.now()}`;
  const amountPaise = (params.amount || 1000) * 100; // Convert to paise
  
  return {
    id: `evt_test_${Date.now()}`,
    event: params.eventType || 'invoice.paid',
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      invoice: {
        entity: {
          id: invoiceId,
          amount: amountPaise,
          amount_paid: params.status === 'paid' ? amountPaise : 0,
          amount_due: params.status === 'paid' ? 0 : amountPaise,
          currency: 'INR',
          status: params.status || 'paid',
          paid_at: params.status === 'paid' ? Math.floor(Date.now() / 1000) : null,
          period_start: Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000), // 30 days ago
          period_end: Math.floor(Date.now() / 1000),
          subscription_id: params.subscriptionId || `sub_test_${Date.now()}`,
          payment_id: params.status === 'paid' ? `pay_test_${Date.now()}` : null,
          notes: {
            company_id: params.companyId,
            plan: 'Test Plan',
          },
        },
      },
    },
  };
}

export function createMockSubscriptionEvent(params: {
  subscriptionId?: string;
  status?: 'active' | 'cancelled' | 'paused' | 'expired';
  eventType?: 'subscription.activated' | 'subscription.cancelled' | 'subscription.paused';
  planId?: string;
}): any {
  const subscriptionId = params.subscriptionId || `sub_test_${Date.now()}`;
  
  return {
    id: `evt_test_${Date.now()}`,
    event: params.eventType || 'subscription.activated',
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      subscription: {
        entity: {
          id: subscriptionId,
          status: params.status || 'active',
          plan_id: params.planId || `plan_test_${Date.now()}`,
          current_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000), // 30 days from now
          cancel_at_cycle_end: false,
        },
      },
    },
  };
}

export function createMockPaymentEvent(params: {
  paymentId?: string;
  orderId?: string;
  amount?: number;
  status?: 'captured' | 'authorized' | 'failed';
  eventType?: 'payment.captured' | 'payment.authorized' | 'payment.failed';
}): any {
  const paymentId = params.paymentId || `pay_test_${Date.now()}`;
  const orderId = params.orderId || `order_test_${Date.now()}`;
  const amountPaise = (params.amount || 1000) * 100;
  
  return {
    id: `evt_test_${Date.now()}`,
    event: params.eventType || 'payment.captured',
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: orderId,
          amount: amountPaise,
          currency: 'INR',
          status: params.status || 'captured',
        },
      },
    },
  };
}

// PHASE-8: Create complete webhook request for testing
export function createTestWebhookRequest(event: any, secret: string = TEST_CONFIG.webhookSecret): {
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

// PHASE-8: Test data fixtures
export const TEST_FIXTURES = {
  validCompanyId: '123e4567-e89b-12d3-a456-426614174000',
  validOrderId: 'order_test_123456',
  validPaymentId: 'pay_test_123456',
  validInvoiceId: 'inv_test_123456',
  validSubscriptionId: 'sub_test_123456',
  validCartId: 'cart_test_123456',
  
  // Test amounts
  testAmounts: {
    small: 100, // ₹1.00
    medium: 10000, // ₹100.00
    large: 100000, // ₹1,000.00
    zero: 0,
    negative: -100,
    veryLarge: 100000000, // ₹1,000,000.00
  },
  
  // Test UUIDs
  testUUIDs: {
    valid: '123e4567-e89b-12d3-a456-426614174000',
    invalid: 'not-a-uuid',
    malformed: '123e4567-e89b-12d3-a456',
  },
  
  // Test purposes
  testPurposes: {
    addonUnit: 'addon_unit_company_123e4567-e89b-12d3-a456-426614174000_qty_10',
    addonBox: 'addon_box_company_123e4567-e89b-12d3-a456-426614174000_qty_5',
    addonCart: 'addon_cart_company_123e4567-e89b-12d3-a456-426614174000_cart_123e4567-e89b-12d3-a456-426614174001',
    invalid: 'invalid_purpose_string',
  },
};

// PHASE-8: Validation test helpers
export function expectValidUUID(uuid: string): void {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) {
    throw new Error(`Invalid UUID: ${uuid}`);
  }
}

export function expectValidAmount(amount: number, min: number = 0, max: number = 100_000_000): void {
  if (!Number.isFinite(amount)) {
    throw new Error(`Amount is not a finite number: ${amount}`);
  }
  if (amount < min || amount > max) {
    throw new Error(`Amount ${amount} is outside valid range [${min}, ${max}]`);
  }
}

export function expectValidEventType(eventType: string): void {
  const validTypes = [
    'invoice.paid',
    'invoice.issued',
    'invoice.cancelled',
    'subscription.activated',
    'subscription.cancelled',
    'subscription.paused',
    'payment.captured',
    'payment.authorized',
    'payment.failed',
    'order.paid',
  ];
  
  if (!validTypes.includes(eventType)) {
    throw new Error(`Invalid event type: ${eventType}. Valid types: ${validTypes.join(', ')}`);
  }
}

// PHASE-8: Mock database helpers
export interface MockDatabase {
  companies: Map<string, any>;
  companySubscriptions: Map<string, any>;
  billingInvoices: Map<string, any>;
  razorpayOrders: Map<string, any>;
  addonCarts: Map<string, any>;
  webhookEvents: Map<string, any>;
}

export function createMockDatabase(): MockDatabase {
  return {
    companies: new Map(),
    companySubscriptions: new Map(),
    billingInvoices: new Map(),
    razorpayOrders: new Map(),
    addonCarts: new Map(),
    webhookEvents: new Map(),
  };
}

// PHASE-8: Test assertion helpers
export function assertWebhookProcessed(result: any): void {
  if (!result.received) {
    throw new Error('Webhook was not received');
  }
}

export function assertWebhookSuccess(result: any): void {
  assertWebhookProcessed(result);
  if (result.error) {
    throw new Error(`Webhook processing failed: ${result.error}`);
  }
}

export function assertInvoiceCreated(result: any): void {
  if (!result.invoice) {
    throw new Error('Invoice was not created');
  }
}

export function assertSubscriptionUpdated(result: any): void {
  if (!result.subscription) {
    throw new Error('Subscription was not updated');
  }
}
