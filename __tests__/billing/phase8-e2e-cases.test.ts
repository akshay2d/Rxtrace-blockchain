/**
 * Phase 8: End-to-end test cases (calculation logic).
 * These tests assert the exact expected numbers from SUBSCRIPTION_BILLING_IMPLEMENTATION_PLAN.md
 * Test 1, 2, 5. Razorpay/invoice verification is manual (see docs/PHASE8_E2E_TESTING.md).
 */
import { describe, it, expect } from 'vitest';
import { calculateFinalAmount } from '@/lib/billing/tax';

describe('Phase 8: Subscription amount (plan test cases)', () => {
  const growthAnnualBase = 500_000;

  it('Test 1: Subscription with GST and Discount — Growth Annual ₹500,000, 10% discount, GST', () => {
    const result = calculateFinalAmount({
      basePrice: growthAnnualBase,
      discount: { type: 'percentage', value: 10, appliesTo: 'subscription' },
      gstNumber: '22ABCDE1234F1Z5',
      itemType: 'subscription',
    });
    expect(result.basePrice).toBe(500_000);
    expect(result.discountAmount).toBe(50_000);
    expect(result.amountAfterDiscount).toBe(450_000);
    expect(result.taxAmount).toBe(81_000); // 18% of 450,000
    expect(result.finalAmount).toBe(531_000);
    expect(result.hasGST).toBe(true);
  });

  it('Test 2: Subscription without GST — Growth Annual ₹500,000, 10% discount, no GST', () => {
    const result = calculateFinalAmount({
      basePrice: growthAnnualBase,
      discount: { type: 'percentage', value: 10, appliesTo: 'subscription' },
      gstNumber: null,
      itemType: 'subscription',
    });
    expect(result.basePrice).toBe(500_000);
    expect(result.discountAmount).toBe(50_000);
    expect(result.amountAfterDiscount).toBe(450_000);
    expect(result.taxAmount).toBe(0);
    expect(result.finalAmount).toBe(450_000);
    expect(result.hasGST).toBe(false);
  });

  it('Test 5: No Discount — Growth Annual ₹500,000, GST only', () => {
    const result = calculateFinalAmount({
      basePrice: growthAnnualBase,
      discount: null,
      gstNumber: '22ABCDE1234F1Z5',
      itemType: 'subscription',
    });
    expect(result.basePrice).toBe(500_000);
    expect(result.discountAmount).toBe(0);
    expect(result.amountAfterDiscount).toBe(500_000);
    expect(result.taxAmount).toBe(90_000); // 18% of 500,000
    expect(result.finalAmount).toBe(590_000);
    expect(result.hasGST).toBe(true);
  });

  it('Tax is calculated on (base - discount) only', () => {
    const withDiscount = calculateFinalAmount({
      basePrice: 100_000,
      discount: { type: 'percentage', value: 20, appliesTo: 'subscription' },
      gstNumber: '22X',
      itemType: 'subscription',
    });
    expect(withDiscount.amountAfterDiscount).toBe(80_000);
    expect(withDiscount.taxAmount).toBe(14_400); // 18% of 80,000
    expect(withDiscount.finalAmount).toBe(94_400);
  });

  it('Billing cycle does not affect calculation (monthly base same logic)', () => {
    const growthMonthlyBase = 49_000;
    const result = calculateFinalAmount({
      basePrice: growthMonthlyBase,
      discount: { type: 'percentage', value: 10, appliesTo: 'subscription' },
      gstNumber: '22X',
      itemType: 'subscription',
    });
    expect(result.amountAfterDiscount).toBe(44_100);
    expect(result.taxAmount).toBe(7938); // 18% of 44,100
    expect(result.finalAmount).toBe(52_038);
  });
});
