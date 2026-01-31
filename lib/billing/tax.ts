// lib/billing/tax.ts
// Tax (GST) and final amount calculation for subscription billing.
// Tax is applied ONLY when company has a valid GST number.

import { PRICING } from '@/lib/billingConfig';

export type TaxCalculation = {
  baseAmount: number;
  taxRate: number;
  taxAmount: number;
  finalAmount: number;
  hasGST: boolean;
  gstNumber: string | null;
};

/**
 * Calculate tax based on GST presence.
 * Tax is applied ONLY if company has valid GST number.
 */
export function calculateTax(
  baseAmount: number,
  gstNumber: string | null | undefined
): TaxCalculation {
  const hasGST = Boolean(gstNumber && String(gstNumber).trim() !== '');

  if (!hasGST) {
    return {
      baseAmount,
      taxRate: 0,
      taxAmount: 0,
      finalAmount: baseAmount,
      hasGST: false,
      gstNumber: null,
    };
  }

  const taxRate = PRICING.TAX_RATE;
  const taxAmount = Number((baseAmount * taxRate).toFixed(2));
  const finalAmount = Number((baseAmount + taxAmount).toFixed(2));

  return {
    baseAmount,
    taxRate,
    taxAmount,
    finalAmount,
    hasGST: true,
    gstNumber: (gstNumber && String(gstNumber).trim()) || null,
  };
}

export type DiscountInput = {
  type: 'percentage' | 'flat' | null;
  value: number | null;
  appliesTo: 'subscription' | 'addon' | 'both' | null;
};

export type FinalAmountResult = {
  basePrice: number;
  discountAmount: number;
  amountAfterDiscount: number;
  taxAmount: number;
  finalAmount: number;
  hasGST: boolean;
  breakdown: {
    base: number;
    discount: number;
    subtotal: number;
    tax: number;
    total: number;
  };
};

/**
 * Calculate final amount with discount and tax.
 * Order: Base Price → Apply Discount → Apply Tax
 */
export function calculateFinalAmount(params: {
  basePrice: number;
  discount: DiscountInput | null;
  gstNumber: string | null;
  itemType: 'subscription' | 'addon';
}): FinalAmountResult {
  const { basePrice, discount, gstNumber, itemType } = params;

  // Step 1: Apply discount
  let discountAmount = 0;
  if (
    discount &&
    discount.type &&
    discount.value !== null &&
    (discount.appliesTo === itemType || discount.appliesTo === 'both')
  ) {
    if (discount.type === 'percentage') {
      discountAmount = (basePrice * discount.value) / 100;
    } else if (discount.type === 'flat') {
      discountAmount = discount.value;
    }
  }

  const amountAfterDiscount = Math.max(0, basePrice - discountAmount);

  // Step 2: Apply tax
  const taxCalc = calculateTax(amountAfterDiscount, gstNumber);

  return {
    basePrice,
    discountAmount: Number(discountAmount.toFixed(2)),
    amountAfterDiscount: Number(amountAfterDiscount.toFixed(2)),
    taxAmount: taxCalc.taxAmount,
    finalAmount: taxCalc.finalAmount,
    hasGST: taxCalc.hasGST,
    breakdown: {
      base: basePrice,
      discount: Number(discountAmount.toFixed(2)),
      subtotal: Number(amountAfterDiscount.toFixed(2)),
      tax: taxCalc.taxAmount,
      total: taxCalc.finalAmount,
    },
  };
}
