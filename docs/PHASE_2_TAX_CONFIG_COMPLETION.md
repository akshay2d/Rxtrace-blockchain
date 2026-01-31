# Phase 2: Tax Configuration — COMPLETED

**Date:** Jan 2026  
**Scope:** Add tax rate constant and helper functions for GST-based billing.

## Completed Tasks

### 2.1 Billing Config
- **File:** `lib/billingConfig.ts`
- Added `TAX_RATE: 0.18` (18% GST)
- Added `TAX_APPLIES_TO: ['subscription', 'addon']`

### 2.2 Tax Helper Module
- **File:** `lib/billing/tax.ts` (NEW)
- `calculateTax(baseAmount, gstNumber)` — applies 18% tax only when company has valid GST
- `calculateFinalAmount(params)` — order: Base → Discount → Tax
- Types: `TaxCalculation`, `DiscountInput`, `FinalAmountResult`

### 2.3 Tests
- **File:** `__tests__/billing/tax.test.ts` (NEW)
- Tests for `calculateTax`: GST present/absent/empty/undefined
- Tests for `calculateFinalAmount`: discount + tax, appliesTo mismatch, flat discount, no GST

## Verification

- Run tests locally: `npm run test -- __tests__/billing/tax.test.ts --run`
- No changes to unit label, SSCC, handset, or other core logic.

## Next Phase

Phase 3: Billing cycle fix (preserve monthly/annual from frontend to Razorpay).
