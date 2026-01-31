// Phase 2: Tax calculation tests
import { describe, it, expect } from 'vitest';
import { calculateTax, calculateFinalAmount } from '@/lib/billing/tax';

describe('Tax Calculation (Phase 2)', () => {
  describe('calculateTax', () => {
    it('applies 18% tax when GST present', () => {
      const result = calculateTax(1000, '22ABCDE1234F1Z5');
      expect(result.hasGST).toBe(true);
      expect(result.taxRate).toBe(0.18);
      expect(result.taxAmount).toBe(180);
      expect(result.finalAmount).toBe(1180);
    });

    it('no tax when GST absent', () => {
      const result = calculateTax(1000, null);
      expect(result.hasGST).toBe(false);
      expect(result.taxRate).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.finalAmount).toBe(1000);
    });

    it('no tax when GST empty string', () => {
      const result = calculateTax(1000, '  ');
      expect(result.hasGST).toBe(false);
      expect(result.taxAmount).toBe(0);
      expect(result.finalAmount).toBe(1000);
    });

    it('no tax when GST undefined', () => {
      const result = calculateTax(1000, undefined);
      expect(result.hasGST).toBe(false);
      expect(result.taxAmount).toBe(0);
    });
  });

  describe('calculateFinalAmount', () => {
    it('calculates final amount with discount and tax', () => {
      const result = calculateFinalAmount({
        basePrice: 10000,
        discount: { type: 'percentage', value: 10, appliesTo: 'subscription' },
        gstNumber: '22ABCDE1234F1Z5',
        itemType: 'subscription',
      });

      expect(result.basePrice).toBe(10000);
      expect(result.discountAmount).toBe(1000);
      expect(result.amountAfterDiscount).toBe(9000);
      expect(result.taxAmount).toBe(1620); // 18% of 9000
      expect(result.finalAmount).toBe(10620);
      expect(result.breakdown.total).toBe(10620);
    });

    it('no discount when appliesTo does not match', () => {
      const result = calculateFinalAmount({
        basePrice: 10000,
        discount: { type: 'percentage', value: 10, appliesTo: 'addon' },
        gstNumber: '22ABCDE1234F1Z5',
        itemType: 'subscription',
      });

      expect(result.discountAmount).toBe(0);
      expect(result.amountAfterDiscount).toBe(10000);
      expect(result.taxAmount).toBe(1800); // 18% of 10000
      expect(result.finalAmount).toBe(11800);
    });

    it('applies flat discount when appliesTo is both', () => {
      const result = calculateFinalAmount({
        basePrice: 5000,
        discount: { type: 'flat', value: 500, appliesTo: 'both' },
        gstNumber: null,
        itemType: 'subscription',
      });

      expect(result.discountAmount).toBe(500);
      expect(result.amountAfterDiscount).toBe(4500);
      expect(result.taxAmount).toBe(0);
      expect(result.finalAmount).toBe(4500);
    });

    it('no tax when GST absent', () => {
      const result = calculateFinalAmount({
        basePrice: 10000,
        discount: null,
        gstNumber: null,
        itemType: 'subscription',
      });

      expect(result.hasGST).toBe(false);
      expect(result.taxAmount).toBe(0);
      expect(result.finalAmount).toBe(10000);
    });
  });
});
