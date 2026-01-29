// PHASE-8: Additional test helpers for webhook handler
// These helpers provide utilities for testing edge cases, error scenarios, and integration testing

import { TEST_FIXTURES, createMockInvoiceEvent, createMockSubscriptionEvent, createMockPaymentEvent } from './test-utils';

// PHASE-8: Edge case test data generators
export function createEdgeCaseEvents() {
  return {
    // Very large amount
    largeAmountInvoice: createMockInvoiceEvent({
      amount: 100_000_000, // ₹1,000,000.00
      status: 'paid',
    }),
    
    // Zero amount (free trial)
    zeroAmountInvoice: createMockInvoiceEvent({
      amount: 0,
      status: 'paid',
    }),
    
    // Missing required fields
    incompleteInvoice: {
      id: 'evt_incomplete',
      event: 'invoice.paid',
      payload: {
        invoice: {
          entity: {
            id: 'inv_incomplete',
            // Missing amount, status, etc.
          },
        },
      },
    },
    
    // Invalid event type
    invalidEventType: {
      id: 'evt_invalid',
      event: 'invalid.event.type',
      payload: {},
    },
    
    // Duplicate event (same ID)
    duplicateEvent: createMockInvoiceEvent({
      invoiceId: 'inv_duplicate',
      amount: 1000,
    }),
  };
}

// PHASE-8: Error scenario generators
export function createErrorScenarios() {
  return {
    // Invalid signature
    invalidSignature: {
      event: createMockInvoiceEvent({ amount: 1000 }),
      signature: 'invalid_signature_hex_string',
    },
    
    // Missing signature
    missingSignature: {
      event: createMockInvoiceEvent({ amount: 1000 }),
      signature: null,
    },
    
    // Oversized payload
    oversizedPayload: {
      event: createMockInvoiceEvent({ amount: 1000 }),
      body: 'x'.repeat(11 * 1024 * 1024), // 11MB (exceeds 10MB limit)
    },
    
    // Missing company
    missingCompany: createMockInvoiceEvent({
      companyId: '00000000-0000-0000-0000-000000000000', // Non-existent
      amount: 1000,
    }),
    
    // Invalid amount
    invalidAmount: createMockInvoiceEvent({
      amount: -100, // Negative amount
    }),
  };
}

// PHASE-8: Load test data generator
export function generateLoadTestEvents(count: number, eventType: 'invoice' | 'subscription' | 'payment' = 'invoice'): any[] {
  const events: any[] = [];
  
  for (let i = 0; i < count; i++) {
    switch (eventType) {
      case 'invoice':
        events.push(createMockInvoiceEvent({
          invoiceId: `inv_load_${i}`,
          amount: Math.floor(Math.random() * 10000) + 100,
        }));
        break;
      case 'subscription':
        events.push(createMockSubscriptionEvent({
          subscriptionId: `sub_load_${i}`,
        }));
        break;
      case 'payment':
        events.push(createMockPaymentEvent({
          paymentId: `pay_load_${i}`,
          orderId: `order_load_${i}`,
          amount: Math.floor(Math.random() * 10000) + 100,
        }));
        break;
    }
  }
  
  return events;
}

// PHASE-8: Concurrency test helpers
export async function simulateConcurrentWebhooks(
  events: any[],
  concurrency: number = 10
): Promise<Array<{ event: any; result: any; error?: Error }>> {
  const results: Array<{ event: any; result: any; error?: Error }> = [];
  
  // Process events in batches
  for (let i = 0; i < events.length; i += concurrency) {
    const batch = events.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (event) => {
        try {
          // PHASE-8: In actual tests, this would call the webhook handler
          return { event, result: { received: true } };
        } catch (error) {
          return { event, result: null, error: error as Error };
        }
      })
    );
    
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({ event: batch[index], result: null, error: result.reason });
      }
    });
  }
  
  return results;
}

// PHASE-8: Test data cleanup helpers
export async function cleanupTestData(admin: any, testData: {
  companyIds?: string[];
  invoiceIds?: string[];
  orderIds?: string[];
}): Promise<void> {
  // PHASE-8: Clean up test data from database
  // This would be used in integration tests to clean up after test runs
  
  if (testData.companyIds) {
    for (const companyId of testData.companyIds) {
      try {
        await admin.from('companies').delete().eq('id', companyId);
      } catch (error) {
        console.warn('Failed to cleanup test company', { companyId, error });
      }
    }
  }
  
  if (testData.invoiceIds) {
    for (const invoiceId of testData.invoiceIds) {
      try {
        await admin.from('billing_invoices').delete().eq('id', invoiceId);
      } catch (error) {
        console.warn('Failed to cleanup test invoice', { invoiceId, error });
      }
    }
  }
  
  if (testData.orderIds) {
    for (const orderId of testData.orderIds) {
      try {
        await admin.from('razorpay_orders').delete().eq('order_id', orderId);
      } catch (error) {
        console.warn('Failed to cleanup test order', { orderId, error });
      }
    }
  }
}

// PHASE-8: Test validation helpers
export function validateWebhookResponse(response: any): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!response) {
    errors.push('Response is null or undefined');
    return { valid: false, errors };
  }
  
  if (typeof response.received !== 'boolean') {
    errors.push('Response missing "received" field');
  }
  
  if (response.error && typeof response.error !== 'string') {
    errors.push('Error field must be a string');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
