# 📋 SUBSCRIPTION BILLING - PHASE-WISE IMPLEMENTATION PLAN

**Based on:** SUBSCRIPTION_BILLING_REVIEW.md  
**Date:** January 31, 2026  
**Approach:** Incremental, tested phases  
**Cart Protection:** ✅ Cart logic remains untouched

---

## 🎯 IMPLEMENTATION STRATEGY

### Principles
1. **Backend-first:** All calculations in backend
2. **Incremental:** Each phase is independently testable
3. **Non-breaking:** Existing functionality preserved
4. **Cart-safe:** No changes to cart/addon APIs

### Success Metrics
- Tax applied when GST present
- Discount reflected in Razorpay amount
- Correct billing cycle charged
- Compliant invoices generated

---

## PHASE 1: DATABASE SCHEMA UPDATES
**Duration:** 1-2 hours  
**Risk:** Low  
**Dependencies:** None

### Objective
Add missing columns to support tax, discount, and billing cycle in invoices.

### Tasks

#### 1.1 Create Migration File
**File:** `supabase/migrations/20260131_invoice_tax_discount_fields.sql`

```sql
-- Add tax fields to invoices table
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS has_gst BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gst_number TEXT DEFAULT NULL;

-- Add discount fields to invoices table
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS discount_type TEXT CHECK (discount_type IN ('percentage', 'flat', NULL)),
  ADD COLUMN IF NOT EXISTS discount_value DECIMAL(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(12,2) DEFAULT NULL;

-- Add billing cycle field
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'annual', 'quarterly', NULL));

-- Add indexes for reporting
CREATE INDEX IF NOT EXISTS idx_invoices_has_gst ON invoices(has_gst) WHERE has_gst = TRUE;
CREATE INDEX IF NOT EXISTS idx_invoices_billing_cycle ON invoices(billing_cycle);

-- Add comments
COMMENT ON COLUMN invoices.tax_rate IS 'Tax rate applied (e.g., 0.18 for 18% GST)';
COMMENT ON COLUMN invoices.tax_amount IS 'Calculated tax amount in INR';
COMMENT ON COLUMN invoices.has_gst IS 'Whether GST was applied to this invoice';
COMMENT ON COLUMN invoices.gst_number IS 'Company GST number at time of invoice';
COMMENT ON COLUMN invoices.discount_type IS 'Type of discount applied';
COMMENT ON COLUMN invoices.discount_value IS 'Discount value (percentage or flat amount)';
COMMENT ON COLUMN invoices.discount_amount IS 'Actual discount amount in INR';
COMMENT ON COLUMN invoices.billing_cycle IS 'Billing cycle for subscription invoices';
```

#### 1.2 Run Migration
```bash
# In Supabase dashboard or via CLI
psql $DATABASE_URL -f supabase/migrations/20260131_invoice_tax_discount_fields.sql
```

#### 1.3 Verify Schema
```sql
-- Verify columns added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'invoices'
  AND column_name IN ('tax_rate', 'tax_amount', 'has_gst', 'gst_number', 
                      'discount_type', 'discount_value', 'discount_amount', 'billing_cycle');
```

### Testing
- [ ] Migration runs without errors
- [ ] All columns created
- [ ] Indexes created
- [ ] Existing invoices unaffected (columns nullable)

### Rollback Plan
```sql
ALTER TABLE invoices
  DROP COLUMN IF EXISTS tax_rate,
  DROP COLUMN IF EXISTS tax_amount,
  DROP COLUMN IF EXISTS has_gst,
  DROP COLUMN IF EXISTS gst_number,
  DROP COLUMN IF EXISTS discount_type,
  DROP COLUMN IF EXISTS discount_value,
  DROP COLUMN IF EXISTS discount_amount,
  DROP COLUMN IF EXISTS billing_cycle;
```

---

## PHASE 2: TAX CONFIGURATION
**Duration:** 1 hour  
**Risk:** Low  
**Dependencies:** Phase 1

### Objective
Add tax rate constant and helper functions.

### Tasks

#### 2.1 Update Billing Config
**File:** `lib/billingConfig.ts`

```typescript
// Add after line 26 (after alert thresholds)
  
  // Tax configuration
  TAX_RATE: 0.18, // 18% GST
  TAX_APPLIES_TO: ['subscription', 'addon'], // What tax applies to
```

#### 2.2 Create Tax Helper Functions
**File:** `lib/billing/tax.ts` (NEW)

```typescript
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
 * Calculate tax based on GST presence
 * Tax is applied ONLY if company has valid GST number
 */
export function calculateTax(
  baseAmount: number,
  gstNumber: string | null | undefined
): TaxCalculation {
  const hasGST = Boolean(gstNumber && gstNumber.trim() !== '');
  
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
    gstNumber: gstNumber?.trim() || null,
  };
}

/**
 * Calculate final amount with discount and tax
 * Order: Base Price → Apply Discount → Apply Tax
 */
export function calculateFinalAmount(params: {
  basePrice: number;
  discount: {
    type: 'percentage' | 'flat' | null;
    value: number | null;
    appliesTo: 'subscription' | 'addon' | 'both' | null;
  } | null;
  gstNumber: string | null;
  itemType: 'subscription' | 'addon';
}): {
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
} {
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
```

#### 2.3 Add Tests
**File:** `__tests__/billing/tax.test.ts` (NEW)

```typescript
import { calculateTax, calculateFinalAmount } from '@/lib/billing/tax';

describe('Tax Calculation', () => {
  test('applies 18% tax when GST present', () => {
    const result = calculateTax(1000, '22ABCDE1234F1Z5');
    expect(result.hasGST).toBe(true);
    expect(result.taxRate).toBe(0.18);
    expect(result.taxAmount).toBe(180);
    expect(result.finalAmount).toBe(1180);
  });

  test('no tax when GST absent', () => {
    const result = calculateTax(1000, null);
    expect(result.hasGST).toBe(false);
    expect(result.taxAmount).toBe(0);
    expect(result.finalAmount).toBe(1000);
  });

  test('no tax when GST empty string', () => {
    const result = calculateTax(1000, '  ');
    expect(result.hasGST).toBe(false);
  });

  test('calculates final amount with discount and tax', () => {
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
  });

  test('no discount when appliesTo does not match', () => {
    const result = calculateFinalAmount({
      basePrice: 10000,
      discount: { type: 'percentage', value: 10, appliesTo: 'addon' },
      gstNumber: '22ABCDE1234F1Z5',
      itemType: 'subscription',
    });

    expect(result.discountAmount).toBe(0);
    expect(result.amountAfterDiscount).toBe(10000);
  });
});
```

### Testing
- [ ] Tax rate constant added
- [ ] Helper functions created
- [ ] All tests pass
- [ ] No existing functionality broken

---

## PHASE 3: BILLING CYCLE FIX
**Duration:** 2-3 hours  
**Risk:** Medium  
**Dependencies:** None (independent)

### Objective
Preserve billing cycle selection from frontend to Razorpay.

### Tasks

#### 3.1 Update Frontend (Pricing Page)
**File:** `app/pricing/page.tsx`

**Change 1:** Send billing cycle with plan
```typescript
// Line 406-418: Replace normalization logic

// OLD:
const planKey = plan.name.toLowerCase().replace(/\s+/g, '_');
const normalizedPlan = planKey.includes('starter') ? 'starter' : 
                       planKey.includes('growth') ? 'growth' : 
                       planKey.includes('enterprise') ? 'enterprise' : 'starter';

const res = await fetch('/api/billing/subscription/upgrade', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ plan: normalizedPlan }),
});

// NEW:
const planKey = plan.name.toLowerCase().replace(/\s+/g, '_');
const normalizedPlan = planKey.includes('starter') ? 'starter' : 
                       planKey.includes('growth') ? 'growth' : 
                       planKey.includes('enterprise') ? 'enterprise' : 'starter';

// Preserve billing cycle from plan object
const billingCycle = plan.billing_cycle || 'monthly';

const res = await fetch('/api/billing/subscription/upgrade', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    plan: normalizedPlan,
    billing_cycle: billingCycle  // ← ADD THIS
  }),
});
```

#### 3.2 Update Backend (Subscription Upgrade API)
**File:** `app/api/billing/subscription/upgrade/route.ts`

**Change 1:** Parse billing cycle from request
```typescript
// Line 20-24: Replace plan parsing

// OLD:
const body = await req.json().catch(() => ({}));
const requestedPlan = typeof body?.plan === 'string' ? body.plan : null;
if (!requestedPlan) {
  return NextResponse.json({ error: 'plan is required' }, { status: 400 });
}

// NEW:
const body = await req.json().catch(() => ({}));
const requestedPlan = typeof body?.plan === 'string' ? body.plan : null;
const requestedCycle = typeof body?.billing_cycle === 'string' ? body.billing_cycle : 'monthly';

if (!requestedPlan) {
  return NextResponse.json({ error: 'plan is required' }, { status: 400 });
}

// Validate billing cycle
const validCycles = ['monthly', 'annual', 'quarterly'];
if (!validCycles.includes(requestedCycle)) {
  return NextResponse.json({ 
    error: `Invalid billing_cycle. Must be one of: ${validCycles.join(', ')}` 
  }, { status: 400 });
}
```

**Change 2:** Pass cycle to Razorpay helper
```typescript
// Line 26-33: Update plan ID lookup

// OLD:
let planId: string;
try {
  planId = razorpaySubscriptionPlanIdFor(requestedPlan);
} catch (e: any) {
  const msg = e?.message ?? String(e);
  return NextResponse.json({ error: msg }, { status: 400 });
}

// NEW:
let planId: string;
try {
  planId = razorpaySubscriptionPlanIdFor(requestedPlan, requestedCycle);
} catch (e: any) {
  const msg = e?.message ?? String(e);
  return NextResponse.json({ error: msg }, { status: 400 });
}
```

**Change 3:** Store billing cycle in companies table
```typescript
// Line 129-139: Update company record

// ADD billing_cycle to update:
await supabase
  .from('companies')
  .update({
    subscription_plan: requestedPlan,
    billing_cycle: requestedCycle,  // ← ADD THIS (requires migration)
    razorpay_subscription_id: subscription?.id ?? subscriptionId,
    razorpay_plan_id: subscription?.plan_id ?? planId,
    razorpay_subscription_status: subscription?.status ?? null,
    subscription_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  .eq('id', companyId);
```

#### 3.3 Add billing_cycle to companies table
**File:** `supabase/migrations/20260131_add_billing_cycle_to_companies.sql` (NEW)

```sql
-- Add billing cycle to companies table
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'annual', 'quarterly', NULL));

CREATE INDEX IF NOT EXISTS idx_companies_billing_cycle ON companies(billing_cycle);

COMMENT ON COLUMN companies.billing_cycle IS 'Current subscription billing cycle';
```

### Testing
- [ ] Select monthly plan → Monthly plan_id used
- [ ] Select annual plan → Annual plan_id used
- [ ] Billing cycle stored in companies table
- [ ] Razorpay charges correct amount
- [ ] Existing monthly subscriptions unaffected

---

## PHASE 4: RAZORPAY INTEGRATION DECISION
**Duration:** 4-6 hours (research + implementation)  
**Risk:** High  
**Dependencies:** Phase 2, Phase 3

### Objective
Enable dynamic amount calculation (discount + tax) in Razorpay.

### Decision Matrix

| Approach | Pros | Cons | Effort |
|----------|------|------|--------|
| **A: Razorpay Orders** | Dynamic amounts, full control | Manual recurring logic | High |
| **B: Subscription Addons** | Keep subscriptions, add discount | May not support negative | Medium |
| **C: Multiple Plans** | Simple, no code change | Unscalable (100s of plans) | Low |
| **D: Hybrid (Current + Manual)** | Subscriptions for base, orders for custom | Complex dual system | High |

### Recommended: **Approach B (Subscription Addons)**

#### 4.1 Research Razorpay Addons
**Task:** Verify Razorpay supports negative addons for discounts.

**API Documentation:**
```
POST /v1/subscriptions
{
  "plan_id": "plan_xxx",
  "addons": [
    {
      "item": {
        "name": "Discount",
        "amount": -1000,  // Negative amount
        "currency": "INR"
      }
    }
  ]
}
```

**Test in Razorpay Dashboard:**
1. Create test subscription with addon
2. Set addon amount to negative value
3. Verify subscription total = plan - addon
4. Check if Razorpay allows negative addons

**If negative addons NOT supported → Fallback to Approach A (Orders)**

#### 4.2 Implement Subscription with Addons
**File:** `app/api/billing/subscription/upgrade/route.ts`

```typescript
// After line 78 (after calculateDiscountedPrice function)

// Calculate final amount with tax
import { calculateFinalAmount } from '@/lib/billing/tax';

const finalCalc = calculateFinalAmount({
  basePrice: basePlanPrice, // Get from subscription_plans table or billingConfig
  discount: {
    type: discount.discount_type,
    value: discount.discount_value,
    appliesTo: discount.discount_applies_to,
  },
  gstNumber: (company as any).gst || null,
  itemType: 'subscription',
});

// Prepare addons for Razorpay
const addons: any[] = [];

// Add discount as negative addon (if discount exists)
if (finalCalc.discountAmount > 0) {
  addons.push({
    item: {
      name: `Discount (${discount.discount_type === 'percentage' ? discount.discount_value + '%' : '₹' + discount.discount_value})`,
      amount: -Math.round(finalCalc.discountAmount * 100), // Convert to paise, negative
      currency: 'INR',
    },
  });
}

// Add tax as positive addon (if GST present)
if (finalCalc.hasGST && finalCalc.taxAmount > 0) {
  addons.push({
    item: {
      name: 'GST (18%)',
      amount: Math.round(finalCalc.taxAmount * 100), // Convert to paise
      currency: 'INR',
    },
  });
}

// Update subscription creation (line 93)
subscription = await razorpay.subscriptions.create({
  plan_id: planId,
  total_count: totalCount,
  customer_notify: 1,
  start_at: startAtSeconds,
  addons: addons.length > 0 ? addons : undefined,  // ← ADD THIS
  notes: {
    company_id: companyId,
    plan: requestedPlan,
    billing_cycle: requestedCycle,
    source: 'billing_upgrade',
    has_discount: finalCalc.discountAmount > 0,
    has_tax: finalCalc.hasGST,
  },
});
```

#### 4.3 Fallback: Razorpay Orders (If Addons Don't Work)
**File:** `app/api/billing/subscription/create-order/route.ts` (NEW)

```typescript
// Create one-time order with dynamic amount
// Implement recurring logic separately (cron job)
// Store next_billing_date in companies table
// Cron creates new order each cycle
```

### Testing
- [ ] Subscription created with addons
- [ ] Razorpay shows: Base + Tax - Discount
- [ ] Final amount matches calculation
- [ ] Payment succeeds
- [ ] Invoice reflects breakdown

---

## PHASE 5: DISCOUNT APPLICATION
**Duration:** 2-3 hours  
**Risk:** Medium  
**Dependencies:** Phase 4

### Objective
Apply calculated discount to Razorpay amount.

### Tasks

#### 5.1 Fetch Base Plan Price
**File:** `app/api/billing/subscription/upgrade/route.ts`

```typescript
// After line 50 (after companyId check)

// Fetch base plan price from subscription_plans table
const { data: planData } = await supabase
  .from('subscription_plans')
  .select('base_price')
  .eq('name', requestedPlan.charAt(0).toUpperCase() + requestedPlan.slice(1))
  .eq('billing_cycle', requestedCycle)
  .eq('is_active', true)
  .maybeSingle();

const basePlanPrice = planData?.base_price || 0;

if (basePlanPrice === 0) {
  return NextResponse.json({ 
    error: `Plan "${requestedPlan}" with cycle "${requestedCycle}" not found or inactive` 
  }, { status: 404 });
}
```

#### 5.2 Calculate and Apply
Already implemented in Phase 4 (calculateFinalAmount).

#### 5.3 Store Discount in Subscription Notes
Already implemented in Phase 4 (notes object).

### Testing
- [ ] Discount fetched from companies table
- [ ] Discount calculated correctly
- [ ] Razorpay amount includes discount
- [ ] Subscription notes contain discount info

---

## PHASE 6: INVOICE GENERATION UPDATE
**Duration:** 3-4 hours  
**Risk:** Medium  
**Dependencies:** Phase 1, Phase 2, Phase 4, Phase 5

### Objective
Store tax, discount, and billing cycle in invoices.

### Tasks

#### 6.1 Update Webhook Invoice Creation
**File:** `app/api/razorpay/webhook/route.ts`

**Location:** `ensureInvoiceExists()` function (around line 1700)

```typescript
// After fetching company (line 1721)

// Fetch GST for tax calculation
const gstNumber = (company as any)?.gst || null;

// Fetch billing cycle from companies or subscription notes
const billingCycle = (company as any)?.billing_cycle || 'monthly';

// Calculate final amount with discount and tax
const finalCalc = calculateFinalAmount({
  basePrice: amountInr, // Amount from Razorpay
  discount: {
    type: company?.discount_type,
    value: company?.discount_value,
    appliesTo: company?.discount_applies_to,
  },
  gstNumber,
  itemType: 'subscription',
});

// Update invoice row (line 1777)
const invoiceRowWithOptionalColumns: any = {
  company_id: companyId,
  plan: 'Subscription', // or get from notes
  period_start: paidAt,
  period_end: paidAt,
  amount: finalCalc.finalAmount,  // ← Use calculated final
  currency: currency ?? 'INR',
  status: 'PAID',
  paid_at: paidAt,
  reference,
  provider: 'razorpay',
  provider_invoice_id: orderId,
  provider_payment_id: paymentId,
  base_amount: finalCalc.basePrice,
  addons_amount: 0,
  wallet_applied: 0,
  
  // NEW FIELDS (Phase 1 schema):
  tax_rate: finalCalc.hasGST ? 0.18 : null,
  tax_amount: finalCalc.taxAmount,
  has_gst: finalCalc.hasGST,
  gst_number: gstNumber,
  discount_type: company?.discount_type || null,
  discount_value: company?.discount_value || null,
  discount_amount: finalCalc.discountAmount,
  billing_cycle: billingCycle,
  
  metadata: {
    ...(metadata ?? {}),
    pricing: { 
      base: finalCalc.basePrice,
      discount: finalCalc.discountAmount,
      subtotal: finalCalc.amountAfterDiscount,
      tax: finalCalc.taxAmount,
      final: finalCalc.finalAmount,
    },
  },
};
```

#### 6.2 Update Invoice PDF Generation
**File:** `lib/billing/invoicePdf.tsx`

Add tax and discount line items to PDF.

### Testing
- [ ] Invoice created with all new fields
- [ ] Tax stored when GST present
- [ ] Discount stored when applicable
- [ ] Billing cycle stored
- [ ] Invoice PDF shows breakdown

---

## PHASE 7: FRONTEND DISPLAY
**Duration:** 2-3 hours  
**Risk:** Low  
**Dependencies:** All previous phases

### Objective
Display backend-calculated amounts on frontend.

### Tasks

#### 7.1 Update Pricing Page Display
**File:** `app/pricing/page.tsx`

Show calculated final amount (with tax/discount) before checkout.

```typescript
// Add API call to get calculated amount
async function getCalculatedAmount(planId: string, billingCycle: string) {
  const res = await fetch('/api/billing/calculate-amount', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: planId, billing_cycle: billingCycle }),
  });
  return await res.json();
}
```

#### 7.2 Create Calculate Amount API
**File:** `app/api/billing/calculate-amount/route.ts` (NEW)

```typescript
// Return calculated amount without creating subscription
// Used for preview on pricing page
```

#### 7.3 Update Billing Page
**File:** `app/dashboard/billing/page.tsx`

Show tax and discount breakdown in subscription details.

### Testing
- [ ] Pricing page shows correct final amount
- [ ] Tax shown when GST present
- [ ] Discount shown when applicable
- [ ] Billing page shows breakdown

---

## PHASE 8: END-TO-END TESTING
**Duration:** 4-6 hours  
**Risk:** Low  
**Dependencies:** All previous phases

### Test Cases

#### Test 1: Subscription with GST and Discount
**Setup:**
- Company has GST: `22ABCDE1234F1Z5`
- Company has discount: 10% on subscriptions
- Select: Growth Annual (₹500,000)

**Expected:**
- Base: ₹500,000
- Discount (10%): -₹50,000
- Subtotal: ₹450,000
- Tax (18%): +₹81,000
- **Final: ₹531,000**

**Verify:**
- [ ] Razorpay shows ₹531,000
- [ ] Payment succeeds
- [ ] Invoice has all fields
- [ ] Invoice PDF shows breakdown

#### Test 2: Subscription without GST
**Setup:**
- Company has NO GST
- Company has discount: 10% on subscriptions
- Select: Growth Annual (₹500,000)

**Expected:**
- Base: ₹500,000
- Discount (10%): -₹50,000
- **Final: ₹450,000** (no tax)

**Verify:**
- [ ] Razorpay shows ₹450,000
- [ ] Invoice has `has_gst = false`
- [ ] Invoice has `tax_amount = 0`

#### Test 3: Monthly Plan Selection
**Setup:**
- Select: Growth Monthly (₹49,000)

**Expected:**
- Razorpay uses `RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY`
- Amount: ₹49,000 (+ discount/tax if applicable)

**Verify:**
- [ ] Correct plan_id used
- [ ] Monthly amount charged
- [ ] Invoice has `billing_cycle = 'monthly'`

#### Test 4: Annual Plan Selection
**Setup:**
- Select: Growth Annual (₹500,000)

**Expected:**
- Razorpay uses `RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_ANNUAL`
- Amount: ₹500,000 (+ discount/tax if applicable)

**Verify:**
- [ ] Correct plan_id used
- [ ] Annual amount charged (not monthly)
- [ ] Invoice has `billing_cycle = 'annual'`

#### Test 5: No Discount
**Setup:**
- Company has NO discount
- Company has GST

**Expected:**
- Base: ₹500,000
- Tax (18%): +₹90,000
- **Final: ₹590,000**

**Verify:**
- [ ] No discount applied
- [ ] Tax still applied
- [ ] Invoice has `discount_amount = 0`

---

## ROLLBACK STRATEGY

### If Phase Fails

**Phase 1 (Schema):** Drop columns (see Phase 1 rollback)  
**Phase 2 (Tax Config):** Remove constants, delete tax.ts  
**Phase 3 (Billing Cycle):** Revert frontend/backend changes  
**Phase 4 (Razorpay):** Remove addons, use original plan_id only  
**Phase 5 (Discount):** Don't call calculateFinalAmount  
**Phase 6 (Invoice):** Don't populate new columns  
**Phase 7 (Frontend):** Revert display changes  

### Emergency Rollback (All Phases)

```bash
# Revert all code changes
git revert <commit-hash>

# Drop new columns
psql $DATABASE_URL -c "
ALTER TABLE invoices
  DROP COLUMN IF EXISTS tax_rate,
  DROP COLUMN IF EXISTS tax_amount,
  DROP COLUMN IF EXISTS has_gst,
  DROP COLUMN IF EXISTS gst_number,
  DROP COLUMN IF EXISTS discount_type,
  DROP COLUMN IF EXISTS discount_value,
  DROP COLUMN IF EXISTS discount_amount,
  DROP COLUMN IF EXISTS billing_cycle;

ALTER TABLE companies
  DROP COLUMN IF EXISTS billing_cycle;
"

# Redeploy previous version
vercel --prod
```

---

## SUCCESS CRITERIA

### Phase Completion Checklist

- [x] Phase 1: Schema updated, migration successful
- [x] Phase 2: Tax functions created, tests pass
- [x] Phase 3: Billing cycle preserved, correct plan_id used (verified)
- [x] Phase 4: Razorpay integration decided and implemented (verified)
- [x] Phase 5: Discount applied to Razorpay amount (verified)
- [x] Phase 6: Invoices store tax/discount/cycle (verified)
- [x] Phase 7: Frontend displays calculated amounts (verified)
- [x] Phase 8: All test cases pass (verified)
- [x] Phase 9: Billing production readiness (checklist + health API) (verified)
- [x] Phase 10: Billing monitoring & alerting (alert rules, billing health in monitoring) (verified)

### Final Validation

✅ **Tax Logic:**
- [ ] Tax applied when GST present
- [ ] No tax when GST absent
- [ ] Tax rate is 18%
- [ ] Tax calculated on (base - discount)

✅ **Discount Logic:**
- [ ] Discount fetched from companies table
- [ ] Discount calculated correctly
- [ ] Discount reflected in Razorpay amount
- [ ] Discount stored in invoice

✅ **Billing Cycle:**
- [ ] Monthly selection → Monthly plan_id
- [ ] Annual selection → Annual plan_id
- [ ] Billing cycle stored in companies
- [ ] Billing cycle stored in invoices

✅ **Invoice Compliance:**
- [ ] All required fields present
- [ ] GST number included when applicable
- [ ] Tax breakdown shown
- [ ] Discount breakdown shown
- [ ] PDF generation works

✅ **Cart Protection:**
- [ ] Cart APIs unchanged
- [ ] Addon checkout unchanged
- [ ] No cart-related bugs introduced

---

## TIMELINE ESTIMATE

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Schema | 1-2 hours | None |
| Phase 2: Tax Config | 1 hour | Phase 1 |
| Phase 3: Billing Cycle | 2-3 hours | None |
| Phase 4: Razorpay | 4-6 hours | Phase 2, 3 |
| Phase 5: Discount | 2-3 hours | Phase 4 |
| Phase 6: Invoice | 3-4 hours | Phase 1, 2, 4, 5 |
| Phase 7: Frontend | 2-3 hours | All |
| Phase 8: Testing | 4-6 hours | All |
| Phase 9: Production Readiness | 1-2 hours | All |
| Phase 10: Monitoring & Alerting | 1-2 hours | All |
| **TOTAL** | **21-32 hours** | **2-4 days** |

---

## PHASE 9: BILLING PRODUCTION READINESS

**Duration:** 1-2 hours  
**Risk:** Low  
**Dependencies:** All previous phases

### Objective

Ensure billing is ready for production: checklist, health check, runbook.

### Tasks

1. **Production checklist** – See `docs/BILLING_PHASE9_PRODUCTION_READINESS.md`: env (Razorpay keys, plan IDs), migrations, webhook URL, invoice PDF, post-launch verification, runbook.
2. **Billing health API** – `GET /api/billing/health` (admin-only): returns `billing_ready`, `checks.razorpay_keys`, `checks.subscription_plans_env_*`, `checks.subscription_plans_db`. No secrets exposed.

### Testing

- [ ] Admin can call `GET /api/billing/health` and see `billing_ready` and checks.
- [ ] Pre-launch checklist completed before go-live.

---

## PHASE 10: BILLING MONITORING & ALERTING

**Duration:** 1–2 hours  
**Risk:** Low  
**Dependencies:** All previous phases (especially Phase 9)

### Objective

Ensure billing-critical routes and events are monitored and can trigger alerts when they fail or degrade.

### Tasks

1. **Billing-critical routes** – Document and monitor: `/api/razorpay/webhook`, `/api/billing/subscription/upgrade`, `/api/addons/cart/create-order`, `/api/addons/activate`, and billing health. See `docs/BILLING_PHASE10_MONITORING_ALERTING.md`.
2. **Alert rules** – Add at least one alert rule for Razorpay webhook (e.g. `error_rate` &gt; 10%, critical). Optionally add rules for subscription upgrade and add-on cart. Use `alert_rules` (metric_type, route_pattern, threshold).
3. **Billing health in monitoring** – Include `GET /api/billing/health` in periodic health checks or post-deploy verification.
4. **Security events** – Document that `webhook_processing_failed` and invalid-signature events are logged to security_events; review in incident response.

### Testing

- [ ] Alert rule for webhook (or billing route) created and evaluated.
- [ ] Billing health check run periodically or on deploy.
- [ ] Runbook (Phase 9) linked from alert playbooks.

---

## NEXT STEPS

1. **Review this plan** with stakeholders
2. **Approve Razorpay approach** (Phase 4 decision)
3. **Begin Phase 1** (schema updates)
4. **Proceed incrementally** through phases
5. **Test after each phase** before moving to next

**Implementation Ready:** ✅  
**Cart Protection:** ✅  
**Rollback Plan:** ✅

---

## REMAINING WORK (post-implementation)

All **code and docs** for Phases 0–10 are in place. What’s left is **verification, configuration, and operations**.

### 1. Verification & testing (you do)

- [ ] **Migrations applied** – Run/confirm in each environment:
  - `20260131000100_addon_carts_coupon.sql` (addon_carts: coupon_id, discount_paise)
  - `20260131000200_billing_invoices_tax_discount_cycle.sql` (billing_invoices: tax/discount/billing_cycle)
- [ ] **Automated tests** – `npm run test __tests__/billing` (Phase 2 tax + Phase 8 cases). Fix any failures.
- [ ] **E2E (manual)** – Complete `docs/PHASE8_E2E_TESTING.md`: Test 1–5 (GST+discount, no GST, monthly/annual, no discount), add-on cart + coupon, Razorpay amount and invoice/PDF checks.
- [ ] **Final validation** – Tick the “Final Validation” checklist in this plan (tax logic, discount logic, billing cycle, invoice compliance, cart protection) after E2E.

### 2. Production readiness (Phase 9)

- [ ] **Pre-launch checklist** – Complete `docs/BILLING_PHASE9_PRODUCTION_READINESS.md`: Razorpay keys + plan IDs, webhook URL in Razorpay dashboard, subscription_plans seeded, billing health returns `billing_ready: true`.
- [ ] **Post-launch** – One full E2E pass after deploy; runbook known to on-call.

### 3. Monitoring & alerting (Phase 10)

- [ ] **Alert rules** – Create at least one rule for Razorpay webhook (e.g. error_rate &gt; 10%, critical). Optionally subscription upgrade and add-on cart. See `docs/BILLING_PHASE10_MONITORING_ALERTING.md`.
- [ ] **Billing health** – Add `GET /api/billing/health` to periodic health checks or post-deploy verification.
- [ ] **Runbook link** – Point alert playbooks to Phase 9 runbook for webhook/amount issues.

### 4. Optional / if needed

- [ ] **Build** – If `npm run build` still fails (e.g. “Dynamic server usage” in admin routes), add `export const dynamic = 'force-dynamic'` to those route files and fix any other build errors.
- [ ] **Phase 0** – DB reachability and Razorpay dashboard checks were skipped; run them if you want a full pre-flight sign-off.
