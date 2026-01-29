# PHASE-8: Webhook Handler Testing Guide

## Overview

This document describes the testing utilities, helpers, and best practices for testing the Razorpay webhook handler.

## Test Utilities

### Location
- `lib/webhook/test-utils.ts` - Core test utilities
- `lib/webhook/test-helpers.ts` - Additional test helpers
- `__tests__/webhook/route.test.ts.example` - Example test file

## Test Utilities Available

### 1. Mock Event Generators

#### `createMockInvoiceEvent(params)`
Creates a mock Razorpay invoice event for testing.

```typescript
import { createMockInvoiceEvent } from '@/lib/webhook/test-utils';

const event = createMockInvoiceEvent({
  invoiceId: 'inv_test_123',
  companyId: 'company-uuid',
  amount: 1000, // ₹10.00
  status: 'paid',
  eventType: 'invoice.paid',
});
```

#### `createMockSubscriptionEvent(params)`
Creates a mock Razorpay subscription event.

```typescript
const event = createMockSubscriptionEvent({
  subscriptionId: 'sub_test_123',
  status: 'active',
  eventType: 'subscription.activated',
});
```

#### `createMockPaymentEvent(params)`
Creates a mock Razorpay payment event.

```typescript
const event = createMockPaymentEvent({
  paymentId: 'pay_test_123',
  orderId: 'order_test_123',
  amount: 1000,
  status: 'captured',
});
```

### 2. Webhook Request Builder

#### `createTestWebhookRequest(event, secret?)`
Creates a complete webhook request with valid signature.

```typescript
import { createTestWebhookRequest } from '@/lib/webhook/test-utils';

const event = createMockInvoiceEvent({ amount: 1000 });
const { body, signature, headers } = createTestWebhookRequest(event);

// Use in test:
const response = await fetch('/api/razorpay/webhook', {
  method: 'POST',
  headers: {
    'x-razorpay-signature': signature,
    'content-type': 'application/json',
    ...headers,
  },
  body,
});
```

### 3. Test Fixtures

Pre-defined test data available in `TEST_FIXTURES`:

```typescript
import { TEST_FIXTURES } from '@/lib/webhook/test-utils';

// Valid UUIDs
TEST_FIXTURES.validCompanyId
TEST_FIXTURES.validOrderId
TEST_FIXTURES.validPaymentId

// Test amounts
TEST_FIXTURES.testAmounts.small    // ₹1.00
TEST_FIXTURES.testAmounts.medium   // ₹100.00
TEST_FIXTURES.testAmounts.large    // ₹1,000.00
TEST_FIXTURES.testAmounts.zero     // ₹0.00

// Test purposes
TEST_FIXTURES.testPurposes.addonUnit
TEST_FIXTURES.testPurposes.addonCart
```

### 4. Validation Helpers

#### `expectValidUUID(uuid)`
Validates UUID format.

```typescript
import { expectValidUUID } from '@/lib/webhook/test-utils';

expectValidUUID('123e4567-e89b-12d3-a456-426614174000'); // ✓
expectValidUUID('invalid'); // ✗ throws error
```

#### `expectValidAmount(amount, min?, max?)`
Validates amount is within range.

```typescript
import { expectValidAmount } from '@/lib/webhook/test-utils';

expectValidAmount(1000, 0, 1000000); // ✓
expectValidAmount(-100); // ✗ throws error
```

### 5. Edge Case Generators

#### `createEdgeCaseEvents()`
Generates various edge case events for testing.

```typescript
import { createEdgeCaseEvents } from '@/lib/webhook/test-helpers';

const edgeCases = createEdgeCaseEvents();
// edgeCases.largeAmountInvoice
// edgeCases.zeroAmountInvoice
// edgeCases.incompleteInvoice
// edgeCases.duplicateEvent
```

### 6. Error Scenario Generators

#### `createErrorScenarios()`
Generates error scenarios for testing error handling.

```typescript
import { createErrorScenarios } from '@/lib/webhook/test-helpers';

const errors = createErrorScenarios();
// errors.invalidSignature
// errors.missingSignature
// errors.oversizedPayload
// errors.missingCompany
```

### 7. Load Testing Helpers

#### `generateLoadTestEvents(count, eventType)`
Generates multiple events for load testing.

```typescript
import { generateLoadTestEvents } from '@/lib/webhook/test-helpers';

const events = generateLoadTestEvents(100, 'invoice');
// Generates 100 invoice events
```

#### `simulateConcurrentWebhooks(events, concurrency)`
Simulates concurrent webhook processing.

```typescript
import { simulateConcurrentWebhooks } from '@/lib/webhook/test-helpers';

const events = generateLoadTestEvents(50, 'invoice');
const results = await simulateConcurrentWebhooks(events, 10);
// Processes 50 events with concurrency of 10
```

### 8. Test Data Cleanup

#### `cleanupTestData(admin, testData)`
Cleans up test data from database.

```typescript
import { cleanupTestData } from '@/lib/webhook/test-helpers';

await cleanupTestData(admin, {
  companyIds: ['test-company-id'],
  invoiceIds: ['test-invoice-id'],
  orderIds: ['test-order-id'],
});
```

## Test Coverage Areas

### 1. Signature Verification
- ✅ Valid signatures
- ✅ Invalid signatures
- ✅ Missing signatures
- ✅ Signature format validation
- ✅ Payload size limits

### 2. Event Processing
- ✅ Invoice events (paid, issued, cancelled)
- ✅ Subscription events (activated, cancelled, paused)
- ✅ Payment events (captured, authorized, failed)
- ✅ Order events

### 3. Data Validation
- ✅ UUID validation
- ✅ Amount validation
- ✅ Date validation
- ✅ Required field validation

### 4. Error Handling
- ✅ Transient errors (retry)
- ✅ Validation errors (no retry)
- ✅ Permanent errors (dead letter queue)
- ✅ Network errors
- ✅ Database errors

### 5. Idempotency
- ✅ Duplicate event handling
- ✅ Idempotency key tracking
- ✅ Already processed detection

### 6. Security
- ✅ Input sanitization
- ✅ Authorization checks
- ✅ Security audit logging
- ✅ Payload size limits

### 7. Performance
- ✅ Processing time measurement
- ✅ Concurrent processing
- ✅ Load testing
- ✅ Resource usage

## Running Tests

### Setup Testing Framework

#### Option 1: Jest
```bash
npm install --save-dev jest @types/jest ts-jest
```

Create `jest.config.js`:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
};
```

#### Option 2: Vitest
```bash
npm install --save-dev vitest @vitest/ui
```

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/__tests__/**/*.test.ts'],
  },
});
```

### Run Tests
```bash
# Jest
npm test

# Vitest
npm run test
```

## Test Examples

### Example 1: Basic Invoice Event Test
```typescript
import { createMockInvoiceEvent, createTestWebhookRequest } from '@/lib/webhook/test-utils';

it('should process invoice.paid event', async () => {
  const event = createMockInvoiceEvent({
    amount: 1000,
    status: 'paid',
    companyId: 'valid-company-uuid',
  });
  
  const { body, signature } = createTestWebhookRequest(event);
  
  // Call webhook handler
  const response = await POST(new Request('http://localhost/api/razorpay/webhook', {
    method: 'POST',
    headers: {
      'x-razorpay-signature': signature,
      'content-type': 'application/json',
    },
    body,
  }));
  
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.received).toBe(true);
  expect(data.invoice).toBe(true);
});
```

### Example 2: Error Handling Test
```typescript
import { createErrorScenarios } from '@/lib/webhook/test-helpers';

it('should reject invalid signature', async () => {
  const scenarios = createErrorScenarios();
  const { event, signature } = scenarios.invalidSignature;
  
  const response = await POST(new Request('http://localhost/api/razorpay/webhook', {
    method: 'POST',
    headers: {
      'x-razorpay-signature': signature,
      'content-type': 'application/json',
    },
    body: JSON.stringify(event),
  }));
  
  expect(response.status).toBe(401);
});
```

### Example 3: Idempotency Test
```typescript
it('should handle duplicate events', async () => {
  const event = createMockInvoiceEvent({
    invoiceId: 'inv_duplicate',
    amount: 1000,
  });
  
  const { body, signature } = createTestWebhookRequest(event);
  
  // Process first time
  const response1 = await POST(/* ... */);
  expect(response1.status).toBe(200);
  
  // Process second time (should be idempotent)
  const response2 = await POST(/* ... */);
  expect(response2.status).toBe(200);
  const data2 = await response2.json();
  expect(data2.duplicate).toBe(true);
});
```

## Best Practices

1. **Always use test fixtures** - Don't hardcode test data
2. **Clean up after tests** - Use `cleanupTestData()` in `afterEach`
3. **Test edge cases** - Use `createEdgeCaseEvents()` and `createErrorScenarios()`
4. **Measure performance** - Use `measureWebhookPerformance()` for critical paths
5. **Test concurrency** - Use `simulateConcurrentWebhooks()` to test race conditions
6. **Validate responses** - Use `validateWebhookResponse()` helper
7. **Use correlation IDs** - Track requests through logs using correlation IDs

## Integration with CI/CD

Add test scripts to `package.json`:

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:webhook": "jest __tests__/webhook"
  }
}
```

## Next Steps

1. Install testing framework (Jest or Vitest)
2. Copy `route.test.ts.example` to `route.test.ts`
3. Implement actual test cases using the utilities
4. Set up CI/CD to run tests automatically
5. Add test coverage reporting
6. Set up integration tests with test database
