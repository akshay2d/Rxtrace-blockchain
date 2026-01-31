# 📌 SUBSCRIPTION BILLING SYSTEM - COMPREHENSIVE REVIEW
**Review Date:** January 31, 2026  
**Status:** REVIEW ONLY - NO CODE CHANGES  
**Scope:** Tax, Discount, Billing Cycle, Razorpay Amount Calculation

---

## 🔒 EXPLICIT SCOPE PROTECTION

✅ **CONFIRMED: Cart logic is NOT touched** - Cart APIs, addon/cart pricing, and checkout flow remain unchanged.

---

## 1️⃣ TAX LOGIC REVIEW (CRITICAL)

### Current State: **TAX LOGIC IS COMPLETELY MISSING**

#### Where GST Details Are Stored
- **Table:** `companies`
- **Columns:** 
  - `gst` (TEXT) - GST number
  - `pan` (TEXT) - PAN number (not in migrations but used in code)
- **UI Component:** `components/settings/TaxSettingsPanel.tsx`
- **Update API:** `/api/company/profile/update`
- **Storage Status:** ✅ GST/PAN can be saved by users

#### Critical Finding: **NO TAX CALCULATION ANYWHERE**

**Searched:**
- ✅ Subscription upgrade API (`/api/billing/subscription/upgrade`)
- ✅ Razorpay webhook (`/api/razorpay/webhook`)
- ✅ Invoice generation
- ✅ Pricing page calculations
- ✅ All billing-related files

**Result:** Tax is **NEVER** fetched, calculated, or applied.

### Why Tax Is Missing Today

1. **No GST check logic** - Code never queries `companies.gst` during checkout
2. **No tax rate defined** - No constant like `TAX_RATE = 18%` exists
3. **No tax calculation** - Formula `(base - discount) * 0.18` is absent
4. **Not passed to Razorpay** - Razorpay subscriptions receive only base plan amount
5. **Not in invoice data** - Invoices don't store or display tax

### Expected Business Rule (NOT IMPLEMENTED)

```typescript
// MISSING LOGIC:
if (company.gst && company.gst.trim() !== '') {
  const TAX_RATE = 0.18; // 18% GST
  const baseAmount = planPrice - discountAmount;
  const taxAmount = baseAmount * TAX_RATE;
  const finalAmount = baseAmount + taxAmount;
} else {
  // No GST = No tax
  const finalAmount = planPrice - discountAmount;
}
```

### Missing Components Required

1. **Tax Rate Constant**
   - Location: `lib/billingConfig.ts`
   - Add: `TAX_RATE: 0.18` (18% GST)

2. **GST Fetch Logic**
   - In: `/api/billing/subscription/upgrade`
   - Fetch: `companies.gst` when creating subscription
   - Check: `if (gst && gst.trim() !== '')`

3. **Tax Calculation Function**
   - Function: `calculateTax(baseAmount: number, hasGST: boolean): number`
   - Apply: After discount, before final amount

4. **Razorpay Integration**
   - Razorpay subscriptions use **plan_id** with pre-configured amounts
   - **PROBLEM:** Razorpay plan amounts are fixed in Razorpay dashboard
   - **Cannot** dynamically add tax to subscription amount
   - **Solution Required:** Either:
     - Create separate Razorpay plans for GST/non-GST (complex)
     - Use Razorpay Orders instead of Subscriptions (allows dynamic amounts)
     - Apply tax as separate line item in invoice only

5. **Invoice Tax Storage**
   - Add columns to `invoices` table:
     - `tax_rate` (DECIMAL)
     - `tax_amount` (DECIMAL)
     - `has_gst` (BOOLEAN)
   - Store GST number in invoice metadata

---

## 2️⃣ DISCOUNT CALCULATION REVIEW

### Current State: **DISCOUNT LOGIC EXISTS BUT INCOMPLETE**

#### Discount Storage
- **Table:** `companies`
- **Columns:**
  - `discount_type` ('percentage' | 'flat')
  - `discount_value` (DECIMAL)
  - `discount_applies_to` ('subscription' | 'addon' | 'both')
- **Admin UI:** ✅ Exists at `/admin/companies/[id]` → Discounts tab
- **Status:** ✅ Discounts can be assigned by admin

#### Where Discount IS Calculated

✅ **Frontend (Pricing Page):**
```typescript
// app/pricing/page.tsx line 104-125
function calculateDiscountedPrice(basePrice, discount) {
  if (discount.discount_type === 'percentage') {
    discountAmount = (basePrice * discount.discount_value) / 100;
  } else if (discount.discount_type === 'flat') {
    discountAmount = discount.discount_value;
  }
  return basePrice - discountAmount;
}
```
- **Purpose:** Display only (shows strikethrough price)
- **Not sent to backend**

✅ **Backend (Subscription Upgrade):**
```typescript
// app/api/billing/subscription/upgrade/route.ts line 61-78
function calculateDiscountedPrice(basePrice) {
  // Fetches discount from companies table
  // Calculates discount amount
  // Returns discounted price
}
```
- **Status:** Function exists
- **Problem:** **Result is NOT used**

#### Critical Finding: **DISCOUNT IS CALCULATED BUT IGNORED**

**In `/api/billing/subscription/upgrade`:**
1. ✅ Discount is fetched from `companies` table (line 38)
2. ✅ `calculateDiscountedPrice()` function exists (line 61)
3. ❌ **Function is NEVER called**
4. ❌ Razorpay receives **hardcoded plan_id** with full price
5. ❌ Discount metadata stored in `notes` but not in amount

**Code Evidence:**
```typescript
// Line 93-103: Razorpay subscription created
subscription = await razorpay.subscriptions.create({
  plan_id: planId,  // ← Uses env var plan (full price)
  total_count: totalCount,
  customer_notify: 1,
  start_at: startAtSeconds,
  notes: {
    company_id: companyId,
    plan: requestedPlan,
    source: 'billing_upgrade',
    // Discount is NOT here
  },
});
```

### Why Discount Is Not Reflected in Razorpay

**Root Cause:** Razorpay **Subscriptions** use pre-configured `plan_id` with fixed amounts set in Razorpay dashboard.

**Current Flow:**
1. Frontend selects plan (e.g., "Growth Monthly")
2. Backend maps to env var: `RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY`
3. Razorpay subscription created with that plan_id
4. **Razorpay charges the amount configured in their dashboard**
5. Discount calculation is bypassed entirely

**Why Razorpay UI Shows Full Price:**
- Razorpay displays the plan amount from their dashboard
- Our discount calculation never reaches Razorpay
- Razorpay has no knowledge of company-specific discounts

### Missing Backend Steps

1. **Apply Calculated Discount**
   - Call `calculateDiscountedPrice()` before creating subscription
   - Store result in variable

2. **Razorpay Integration Options:**

   **Option A: Use Razorpay Orders (Recommended)**
   - Switch from `razorpay.subscriptions.create()` to `razorpay.orders.create()`
   - Orders accept dynamic `amount` parameter
   - Allows: `amount: discountedPrice * 100` (paise)
   - Downside: Manual recurring billing logic needed

   **Option B: Razorpay Subscription Addons**
   - Create subscription with base plan
   - Add negative addon for discount: `addons: [{ item: { amount: -discountAmount } }]`
   - Razorpay will show: Base - Discount = Final
   - Downside: Razorpay may not support negative addons

   **Option C: Multiple Razorpay Plans**
   - Create separate plans for each discount tier
   - Example: `GROWTH_MONTHLY_10PCT`, `GROWTH_MONTHLY_20PCT`
   - Select plan_id based on discount
   - Downside: Unscalable (100s of plans needed)

3. **Persist Discount in Invoice**
   - Add to `invoices` table:
     - `discount_type`
     - `discount_value`
     - `discount_amount`
     - `base_amount`
     - `final_amount`

4. **Update Webhook Handler**
   - In `/api/razorpay/webhook`, when payment succeeds:
   - Fetch company discount
   - Recalculate and validate amounts
   - Store discount breakdown in invoice

---

## 3️⃣ FINAL AMOUNT & RAZORPAY ORDER REVIEW

### Current State: **BILLING CYCLE WIRING IS BROKEN**

#### Expected Formula
```
Final Amount = (Base Plan Price - Discount) + Tax (if GST exists)
```

#### Actual Formula
```
Final Amount = Razorpay Plan Amount (from env var)
// Discount and tax are ignored
```

### Critical Issues Found

#### Issue 1: **₹5 Appearing in Razorpay**

**Root Cause:** Trial activation uses hardcoded ₹5 for payment method verification.

**Code Location:** `/api/razorpay/create-order`
```typescript
// app/pricing/page.tsx line 300
const res = await fetch("/api/razorpay/create-order", {
  method: "POST",
  body: JSON.stringify({ amount: 5, purpose: "trial_auth" }),
});
```

**When This Happens:**
- User clicks "Start Free Trial"
- ₹5 authorization charge (refunded after trial)
- **Not a bug** - intentional trial verification

**Confusion:** If user sees ₹5 during subscription upgrade, it means:
- Wrong API endpoint called, OR
- Frontend is calling trial API instead of subscription API

#### Issue 2: **Monthly Price Shown for Annual Plan**

**Root Cause:** Billing cycle selection is lost between frontend and backend.

**Trace:**
1. **Pricing Page (Frontend):**
   ```typescript
   // Line 389: subscribeToPlan(plan: Plan)
   // Line 406: Normalizes plan name
   const planKey = plan.name.toLowerCase().replace(/\s+/g, '_');
   const normalizedPlan = planKey.includes('starter') ? 'starter' : 
                          planKey.includes('growth') ? 'growth' : 
                          planKey.includes('enterprise') ? 'enterprise' : 'starter';
   ```
   - **Problem:** Billing cycle (monthly/annual) is **stripped**
   - Only plan name sent: `{ plan: "growth" }`
   - Annual selection is **lost**

2. **Backend (Subscription Upgrade):**
   ```typescript
   // Line 28: razorpaySubscriptionPlanIdFor(requestedPlan)
   // lib/razorpay/server.ts line 72-87
   ```
   - Receives: `"growth"` (no cycle info)
   - Defaults to: `'monthly'` (line 23)
   - Uses: `RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY`

**Result:** Annual plan selection → Monthly plan charged

#### Issue 3: **Plan ID Passed to Backend**

**Current:** Only plan name sent (starter/growth/enterprise)  
**Missing:** Billing cycle (monthly/annual/quarterly)

**Fix Required:**
```typescript
// Frontend should send:
{ 
  plan: "growth",
  billing_cycle: "annual"  // ← ADD THIS
}

// Or combined:
{ plan: "growth_annual" }
```

### Exact Break Points

1. **Break Point 1:** `app/pricing/page.tsx` line 406-409
   - Billing cycle stripped from plan name
   - Only base plan name kept

2. **Break Point 2:** `lib/razorpay/server.ts` line 23
   - Defaults to `'monthly'` when cycle not provided
   - No validation that cycle matches user selection

3. **Break Point 3:** Razorpay plan_id selection
   - Uses monthly env var even for annual selection
   - Wrong amount charged

---

## 4️⃣ PRICING PAGE → SUBSCRIPTION WIRING REVIEW

### Current Flow

```
[Pricing Page]
  ↓ User selects "Growth Annual"
  ↓ subscribeToPlan(plan: Plan)
  ↓ plan.name = "Growth"
  ↓ plan.billing_cycle = "yearly"
  ↓
  ↓ Normalize: "growth" (cycle LOST)
  ↓
[POST /api/billing/subscription/upgrade]
  ↓ body: { plan: "growth" }
  ↓ razorpaySubscriptionPlanIdFor("growth")
  ↓ Defaults to: "monthly"
  ↓ Uses: RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY
  ↓
[Razorpay]
  ↓ Subscription created with MONTHLY plan
  ↓ User charged monthly amount
  ✗ Annual selection ignored
```

### Validation Results

❌ **Billing cycle selection is NOT honored**  
❌ **Annual plan amount is NOT preserved**  
❌ **Plan ID wiring is broken**

### Root Cause

**Frontend sends incomplete data:**
```typescript
// app/pricing/page.tsx line 418
body: JSON.stringify({ plan: normalizedPlan }),
// normalizedPlan = "growth" (no cycle)
```

**Backend has no cycle info:**
```typescript
// app/api/billing/subscription/upgrade/route.ts line 21
const requestedPlan = typeof body?.plan === 'string' ? body.plan : null;
// requestedPlan = "growth" (no cycle)
```

**Razorpay helper defaults to monthly:**
```typescript
// lib/razorpay/server.ts line 14-30
function parsePlanAndCycle(raw: unknown) {
  // ...
  const cycle = maybeCycle ? normalizeBillingCycle(maybeCycle) : 'monthly';
  // ↑ Defaults to monthly when cycle not in string
}
```

---

## 5️⃣ INVOICE DATA READINESS REVIEW

### Current Invoice Schema

**Table:** `invoices` (from webhook code)

**Existing Columns:**
- `company_id`
- `plan`
- `period_start`, `period_end`
- `amount` (final paid amount)
- `currency`
- `status`
- `paid_at`
- `reference`
- `provider` ('razorpay')
- `provider_invoice_id`
- `provider_payment_id`
- `base_amount`
- `addons_amount`
- `wallet_applied`
- `metadata` (JSONB)

### Missing Invoice Fields

❌ **Tax fields:**
- `tax_rate` (DECIMAL) - e.g., 0.18 for 18%
- `tax_amount` (DECIMAL) - calculated tax
- `has_gst` (BOOLEAN) - whether GST was applied
- `gst_number` (TEXT) - company's GST number at time of invoice

❌ **Discount fields:**
- `discount_type` ('percentage' | 'flat')
- `discount_value` (DECIMAL)
- `discount_amount` (DECIMAL) - actual discount applied

❌ **Billing cycle:**
- `billing_cycle` ('monthly' | 'annual' | 'quarterly')

### Invoice Generation Logic

**Status:** ✅ Invoice generation exists in webhook  
**Location:** `/api/razorpay/webhook` line 1700-1850

**Current Flow:**
1. Razorpay webhook receives payment success
2. `ensureInvoiceExists()` called
3. Invoice created with basic fields
4. **Discount logic exists** (line 1720-1748) for add-ons
5. **But NOT for subscriptions**

### Compliance Requirements

**For GST-compliant invoices, need:**
1. ✅ Company GST number (stored in `companies.gst`)
2. ❌ Tax breakdown (rate, amount)
3. ❌ Discount breakdown (type, value, amount)
4. ✅ Base amount (exists as `base_amount`)
5. ✅ Final amount (exists as `amount`)
6. ❌ Billing cycle/period clarity

---

## 6️⃣ DELIVERABLES - CONFIRMED ISSUES

### List of Confirmed Issues

1. **Tax Logic Completely Missing**
   - No GST check during checkout
   - No tax calculation anywhere
   - Not passed to Razorpay
   - Not in invoices

2. **Discount Calculated But Ignored**
   - Function exists but never called
   - Razorpay receives full price
   - Discount only visual (frontend)

3. **Billing Cycle Selection Lost**
   - Frontend strips cycle from plan name
   - Backend defaults to monthly
   - Annual selection ignored

4. **Razorpay Amount Mismatch**
   - Uses hardcoded plan_id amounts
   - Cannot apply dynamic discount
   - Cannot add tax

5. **Invoice Data Incomplete**
   - Missing tax fields
   - Missing discount fields for subscriptions
   - Missing billing cycle

### List of Missing Logic/Components

#### Tax Implementation Needs:
1. Tax rate constant (18%)
2. GST fetch from companies table
3. Tax calculation function
4. Razorpay integration decision (Orders vs Subscriptions)
5. Invoice tax storage (schema + code)

#### Discount Implementation Needs:
1. Call existing `calculateDiscountedPrice()` function
2. Switch to Razorpay Orders (for dynamic amounts)
3. Pass discounted amount to Razorpay
4. Store discount in invoice
5. Update webhook to validate discount

#### Billing Cycle Fix Needs:
1. Frontend: Send cycle with plan name
2. Backend: Parse and validate cycle
3. Razorpay: Select correct plan_id (monthly/annual)
4. Invoice: Store billing cycle

### Clear Explanation of Current Failures

| Issue | Why It Fails | Impact |
|-------|-------------|---------|
| **Tax Missing** | Code never checks `companies.gst` | No tax charged, invoices non-compliant |
| **Discount Ignored** | Razorpay uses fixed plan_id amounts | Full price charged despite discount |
| **Wrong Billing Cycle** | Frontend strips cycle, backend defaults to monthly | Annual users charged monthly |
| **₹5 Appearing** | Trial auth flow (intentional) | Confusing UX if shown during subscription |
| **Invoice Incomplete** | Schema missing tax/discount columns | Cannot generate compliant invoices |

### Dependency Order for Fixes

**Phase 1: Schema Updates (Database)**
1. Add tax columns to `invoices` table
2. Add discount columns to `invoices` table
3. Add `billing_cycle` column to `invoices` table

**Phase 2: Tax Logic (Backend)**
1. Add `TAX_RATE` constant to `lib/billingConfig.ts`
2. Create `calculateTax()` function
3. Fetch GST in subscription upgrade API
4. Apply tax calculation

**Phase 3: Billing Cycle Fix (Frontend + Backend)**
1. Frontend: Send `billing_cycle` with plan
2. Backend: Parse and validate cycle
3. Select correct Razorpay plan_id

**Phase 4: Razorpay Integration Decision**
1. **Decision:** Use Orders or Subscriptions?
   - **Orders:** Dynamic amounts (discount + tax)
   - **Subscriptions:** Fixed amounts (current)
2. Implement chosen approach

**Phase 5: Discount Application**
1. Call `calculateDiscountedPrice()` in upgrade API
2. Pass discounted amount to Razorpay
3. Store discount in invoice

**Phase 6: Invoice Generation**
1. Update webhook to calculate tax
2. Update webhook to store discount
3. Update invoice PDF generation
4. Add GST number to invoice

**Phase 7: Testing**
1. Test with GST → Tax applied
2. Test without GST → No tax
3. Test with discount → Discount applied
4. Test annual plan → Correct amount
5. Test invoice generation → All fields present

---

## ✅ SUCCESS CRITERIA - REVIEW COMPLETE

This review can clearly answer:

✅ **Why tax is missing today**  
→ Code never checks GST, no tax calculation exists

✅ **How GST should control tax application**  
→ If `companies.gst` is present and non-empty, apply 18% tax

✅ **Why discount is not reflected in Razorpay**  
→ Razorpay uses fixed plan_id amounts, discount calculation bypassed

✅ **Why Razorpay sometimes shows wrong amount**  
→ ₹5 is trial auth (intentional), billing cycle lost causes monthly charge for annual

✅ **Why annual plans can bill monthly amounts**  
→ Frontend strips cycle, backend defaults to monthly, wrong plan_id used

✅ **What exact logic is missing**  
→ Tax calculation, discount application, cycle preservation, Razorpay amount passing

---

## 🚫 NON-GOALS CONFIRMED

✅ No feature additions  
✅ No refactoring  
✅ No optimizations  
✅ No UI redesign  
✅ **No cart changes** (cart logic untouched)

---

## 🧠 FINAL NOTE

**Backend as Single Source of Truth:**

All calculations (tax, discount, final amount) MUST happen in:
- `/api/billing/subscription/upgrade` (for subscriptions)
- `/api/razorpay/webhook` (for invoice generation)

Frontend should ONLY display backend-calculated values.

**Critical Decision Required:**

**Razorpay Subscriptions vs Orders:**
- **Current:** Subscriptions (fixed amounts, recurring automatic)
- **Needed:** Dynamic amounts (discount + tax)
- **Options:**
  1. Switch to Orders (manual recurring)
  2. Use Subscription Addons (if negative addons supported)
  3. Create multiple plans (unscalable)

**Recommendation:** Evaluate Razorpay Orders for flexibility with tax and discount.

---

**Review Completed:** January 31, 2026  
**Next Step:** Phase-wise implementation plan based on dependency order above
