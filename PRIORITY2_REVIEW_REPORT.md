# PRIORITY-2 REVIEW REPORT
## Company-Direct Discount · Admin Analytics · Subscription Quotas

**Date:** 2026-01-26  
**Review Type:** Gap Identification Only (No Code Changes)  
**Scope:** PRIORITY-2 items only (Trial logic is LOCKED)

---

## EXECUTIVE SUMMARY

This review identifies **3 critical gaps** in PRIORITY-2 systems:

1. **Company-Direct Discount Not Applied:** Discount stored correctly but never read/applied during pricing, payment, or invoicing
2. **Admin Analytics Inconsistencies:** Overview counts subscriptions instead of companies, revenue excludes discounts, `!inner` joins drop valid data
3. **Subscription Quota Mapping Unclear:** Different APIs read from different sources, quota types (UNIT/BOX/CARTON/PALLET/SSCC) not clearly mapped to code generation types

---

## PART A: COMPANY-DIRECT DISCOUNT SYSTEM REVIEW

### A.1 Where Discount is Stored (CONFIRMED ✅)

**File:** `app/api/admin/companies/discount/route.ts`

**Storage Location:**
- **Table:** `companies`
- **Fields:**
  - `discount_type` (TEXT): 'percentage' | 'flat' | null
  - `discount_value` (NUMERIC): Discount amount/percentage
  - `discount_applies_to` (TEXT): 'subscription' | 'addon' | 'both' | null
  - `discount_notes` (TEXT): Optional notes

**API Endpoints (WORKING ✅):**
- `PUT /api/admin/companies/discount` - Sets discount (lines 7-122)
- `GET /api/admin/companies/discount` - Gets discount (lines 192-225)
- `DELETE /api/admin/companies/discount` - Removes discount (lines 125-189)

**Status:** ✅ Discount is saved correctly to database

---

### A.2 Where Discount SHOULD Apply (BUT DOESN'T ❌)

#### A.2.1 Pricing Page Display

**File:** `app/pricing/page.tsx`

**Current State:**
- **Line 89-96:** Plan type definition shows `base_price` directly
- **Line 200-300+:** Plan cards display `plan.base_price` without discount
- **Gap:** No code reads `companies.discount_*` fields
- **Gap:** No discount calculation applied to displayed prices

**Expected Behavior:**
- Fetch company discount from `/api/admin/companies/discount?company_id=...`
- Calculate discounted price: `final_price = base_price * (1 - discount_percentage/100)` OR `final_price = base_price - discount_value`
- Display both original and discounted price

**Missing Link:**
- No API call to fetch company discount
- No discount calculation logic
- No UI to show discounted price

---

#### A.2.2 Razorpay Payment Amount

**Files to Check:**
- `app/api/razorpay/create-order/route.ts`
- `app/api/billing/subscription/upgrade/route.ts`
- Any Razorpay order creation endpoint

**Current State:**
- **Gap:** Payment amount calculation does NOT read `companies.discount_*`
- **Gap:** Full `base_price` is sent to Razorpay
- **Gap:** No discount applied before payment

**Expected Behavior:**
- Before creating Razorpay order:
  1. Fetch company discount
  2. Calculate discounted amount
  3. Send discounted amount to Razorpay
  4. Store original price and discount in order metadata

**Missing Link:**
- No discount fetch in payment flow
- No discount calculation before Razorpay API call
- No discount metadata stored in `razorpay_orders` table

---

#### A.2.3 Invoice Generation

**Files to Check:**
- `app/api/billing/invoices/route.ts`
- `app/api/billing/invoices/[id]/route.ts`
- Any invoice creation logic

**Current State:**
- **Gap:** Invoice amount = `base_price` (no discount applied)
- **Gap:** Invoice does NOT show discount breakdown
- **Gap:** No discount fields in invoice metadata

**Expected Behavior:**
- Invoice should show:
  - Original amount: `base_price`
  - Discount: `discount_value` or `(base_price * discount_percentage / 100)`
  - Final amount: `base_price - discount`
- Store discount details in invoice metadata

**Missing Link:**
- No discount fetch during invoice creation
- No discount calculation in invoice amount
- No discount display in invoice template

---

### A.3 Exact Missing Links (File + Line Level)

#### Missing Link 1: Pricing Page Discount Display
- **File:** `app/pricing/page.tsx`
- **Location:** Plan card rendering (around line 200-300)
- **Missing:** 
  - API call to fetch company discount
  - Discount calculation function
  - UI to display discounted price

#### Missing Link 2: Payment Amount Calculation
- **Files:** 
  - `app/api/razorpay/create-order/route.ts` (if exists)
  - `app/api/billing/subscription/upgrade/route.ts`
- **Missing:**
  - Fetch company discount before payment
  - Apply discount to payment amount
  - Store discount in order metadata

#### Missing Link 3: Invoice Discount Application
- **Files:**
  - `app/api/billing/invoices/route.ts`
  - Invoice generation logic
- **Missing:**
  - Fetch company discount during invoice creation
  - Calculate discounted invoice amount
  - Include discount breakdown in invoice

---

## PART B: ADMIN ANALYTICS REVIEW

### B.1 Overview Analytics Issues

**File:** `app/api/admin/analytics/overview/route.ts`

#### Issue 1: Counts Subscriptions Instead of Companies

**Current Code (Line 13-22):**
```typescript
const { data: subscriptions } = await supabase
  .from('company_subscriptions')
  .select('status');

const totalCompanies = subscriptions?.length || 0;
```

**Problem:**
- Counts `company_subscriptions` records (1 per subscription)
- If a company has multiple subscription records (historical), it's counted multiple times
- Should count DISTINCT `company_id` instead

**Fix Required:**
- Change to: `SELECT DISTINCT company_id FROM company_subscriptions`
- Or: `SELECT COUNT(DISTINCT company_id)`

---

#### Issue 2: Revenue Query Excludes Valid Subscriptions

**Current Code (Line 26-35):**
```typescript
const { data: activeSubs } = await supabase
  .from('company_subscriptions')
  .select(`
    status,
    subscription_plans(
      billing_cycle,
      base_price
    )
  `)
  .in('status', ['ACTIVE', 'TRIAL']);
```

**Problem:**
- Uses implicit join (no `!inner` specified, but Supabase may default to inner join)
- If `subscription_plans` join fails (e.g., plan_id = NULL for TRIAL), subscription is excluded
- TRIAL subscriptions are correctly skipped in revenue calculation (line 44-46), but query may still exclude them from count

**Status:** ✅ Partially fixed (TRIAL revenue = 0 is correct)
**Remaining Issue:** Query structure may still exclude subscriptions without plans

---

#### Issue 3: Revenue Ignores Discounts

**Current Code (Line 41-59):**
```typescript
(subscriptions || []).forEach((sub: any) => {
  // ... calculates price from plan.base_price
  const price = Number(plan.base_price || 0);
  // ... adds to MRR/ARR
});
```

**Problem:**
- Uses `base_price` directly
- Does NOT fetch `companies.discount_*` fields
- Does NOT apply discount to revenue calculation
- Revenue numbers are inflated (show full price, not discounted price)

**Missing Link:**
- No join to `companies` table to fetch discount
- No discount calculation in revenue loop
- Revenue should be: `base_price - discount` (if discount applies)

---

### B.2 Revenue Analytics Issues

**File:** `app/api/admin/analytics/revenue/route.ts`

#### Issue 1: `!inner` Join Excludes Subscriptions Without Plans

**Current Code (Line 13-25):**
```typescript
const { data: subscriptions } = await supabase
  .from('company_subscriptions')
  .select(`
    id,
    status,
    subscription_plans!inner(
      id,
      name,
      billing_cycle,
      base_price
    )
  `)
  .in('status', ['ACTIVE', 'TRIAL']);
```

**Problem:**
- `!inner` join means: subscription MUST have matching plan
- TRIAL subscriptions have `plan_id = NULL` → excluded from query
- This is actually CORRECT for revenue (TRIAL = ₹0), but query structure is fragile

**Status:** ✅ Works correctly (TRIAL excluded = correct for revenue)
**Note:** Query structure is correct but could be more explicit

---

#### Issue 2: Revenue Ignores Discounts

**Current Code (Line 34-49):**
```typescript
(subscriptions || []).forEach((sub: any) => {
  const plan = sub.subscription_plans;
  const price = Number(plan.base_price || 0);
  // ... adds price to MRR/ARR
});
```

**Problem:**
- Same as Overview: uses `base_price` without discount
- Revenue numbers are inflated
- Should show net revenue (after discounts)

**Missing Link:**
- No join to `companies` for discount fields
- No discount calculation
- Revenue should be: `base_price - discount`

---

#### Issue 3: Add-on Revenue Ignores Discounts

**Current Code (Line 70-78):**
```typescript
(addOns || []).forEach((addOn: any) => {
  const monthlyRevenue = (Number(addOnData.price || 0) * (addOn.quantity || 1)) / 12;
  addOnRevenue += monthlyRevenue;
});
```

**Problem:**
- If `discount_applies_to = 'addon'` or `'both'`, add-on revenue should also be discounted
- Currently ignores company discount for add-ons

**Missing Link:**
- No check for `discount_applies_to`
- No discount applied to add-on revenue

---

### B.3 Exact Missing Links (File + Line Level)

#### Missing Link 1: Company Count in Overview
- **File:** `app/api/admin/analytics/overview/route.ts`
- **Line:** 13-19
- **Fix:** Change to `COUNT(DISTINCT company_id)` or `SELECT DISTINCT company_id`

#### Missing Link 2: Discount Join in Overview Revenue
- **File:** `app/api/admin/analytics/overview/route.ts`
- **Line:** 26-35
- **Fix:** Add join to `companies` table, fetch discount fields, apply discount in calculation (line 41-59)

#### Missing Link 3: Discount Join in Revenue Analytics
- **File:** `app/api/admin/analytics/revenue/route.ts`
- **Line:** 13-25
- **Fix:** Add join to `companies` table, fetch discount fields, apply discount in calculation (line 34-49)

#### Missing Link 4: Add-on Discount in Revenue
- **File:** `app/api/admin/analytics/revenue/route.ts`
- **Line:** 70-78
- **Fix:** Check `discount_applies_to`, apply discount to add-on revenue if applicable

---

## PART C: SUBSCRIPTION QUOTA REVIEW

### C.1 Source of Truth for Quota Limits

#### Source 1: `plan_items` Table (Admin-Editable)

**Location:** Admin dashboard → Subscriptions → Edit Plan

**Fields:**
- `limit_value` (INTEGER): Quota limit
- `limit_type` (TEXT): 'HARD' | 'SOFT' | 'NONE'
- `label` (TEXT): Feature label (e.g., "Unit Labels", "Box Labels")

**Status:** ✅ Admin can edit quota values
**Gap:** Not clear how these map to actual code generation types

---

#### Source 2: `billing_usage` Table (Runtime Quotas)

**File:** `lib/billing/usage.ts`

**Fields:**
- `unit_labels_quota`
- `box_labels_quota`
- `carton_labels_quota`
- `pallet_labels_quota`
- `sscc_labels_quota` (consolidated)

**Usage:**
- Read by: `app/api/dashboard/stats/route.ts` (line 49, 175-179)
- Updated during: Trial activation, subscription activation

**Status:** ✅ Used for quota display
**Gap:** Source of these values unclear (hardcoded vs. from `plan_items`)

---

#### Source 3: `PRICING` Config (Hardcoded)

**File:** `lib/billingConfig.ts` (referenced in `lib/billing/period.ts`)

**Function:** `quotasForPlan(planType)` (line 31-44 in `period.ts`)

**Returns:**
- `unit_labels_quota`
- `box_labels_quota`
- `carton_labels_quota`
- `pallet_labels_quota`
- `sscc_labels_quota` (calculated as sum)

**Status:** ✅ Used for quota calculation
**Gap:** Hardcoded values, not from `plan_items` table

---

### C.2 Quota Usage Sources

#### Source 1: `billing_usage` Table (Current Period)

**File:** `lib/billing/usage.ts`, `app/api/dashboard/stats/route.ts`

**Fields:**
- `unit_labels_used`
- `box_labels_used`
- `carton_labels_used`
- `pallet_labels_used`
- `sscc_labels_used`

**Usage:**
- Read by: Dashboard stats API (line 175-179)
- Updated by: Code generation APIs (atomic increments)

**Status:** ✅ Used for quota display on billing page

---

#### Source 2: `usage_counters` Table (Monthly Aggregates)

**File:** `app/api/admin/analytics/overview/route.ts`

**Fields:**
- `used_quantity`
- `metric_type` (UNIT | BOX | CARTON | SSCC)

**Usage:**
- Read by: Admin analytics (line 87-92)
- Updated by: Database triggers (aggregates from `usage_events`)

**Status:** ✅ Used for analytics
**Gap:** Different time period than `billing_usage` (calendar month vs. billing period)

---

### C.3 Quota Type Mapping (UNKNOWN / INCONSISTENT)

#### Mapping Question 1: UNIT Quota

**What code generation consumes UNIT quota?**
- **Possible Answer:** Unit label generation (`/api/issues/route.ts`)
- **Evidence Needed:** Check code generation API quota consumption logic

**Gap:** Not clearly documented which API consumes which quota

---

#### Mapping Question 2: BOX Quota

**What code generation consumes BOX quota?**
- **Possible Answer:** Box-level SSCC generation
- **Evidence Needed:** Check SSCC generation API

**Gap:** Not clearly documented

---

#### Mapping Question 3: CARTON Quota

**What code generation consumes CARTON quota?**
- **Possible Answer:** Carton-level SSCC generation
- **Evidence Needed:** Check SSCC generation API

**Gap:** Not clearly documented

---

#### Mapping Question 4: PALLET / SSCC Quota

**What code generation consumes PALLET/SSCC quota?**
- **Possible Answer:** Pallet-level SSCC generation
- **Evidence:** `lib/billing/usage.ts` line 98: `sscc_labels_quota = box + carton + pallet`
- **Gap:** Consolidated quota, but unclear if all SSCC levels consume same quota or separate

---

### C.4 Why Numbers Differ Across Pages

#### Billing Page vs. Dashboard

**Billing Page:**
- Reads from: `billing_usage` table (billing period)
- Shows: Current billing period usage vs. quota

**Dashboard:**
- Reads from: `billing_usage` table (same source)
- Shows: Same data via `/api/dashboard/stats`

**Status:** ✅ Should be consistent (same source)

---

#### Analytics vs. Dashboard

**Analytics:**
- Reads from: `usage_counters` table (calendar month)
- Shows: Monthly aggregated usage

**Dashboard:**
- Reads from: `billing_usage` table (billing period)

**Gap:** Different time periods → different numbers
- Analytics: Calendar month (Jan 1-31)
- Dashboard: Billing period (e.g., Jan 15 - Feb 15)

**This is EXPECTED but not clearly explained to users**

---

#### Admin Quota Edits vs. Actual Quotas

**Admin Edits:**
- Edits: `plan_items.limit_value`
- Location: Admin dashboard → Subscriptions

**Actual Quotas Used:**
- Source: `PRICING` config (hardcoded) OR `billing_usage` (from trial/subscription activation)

**Gap:** Admin edits to `plan_items` may NOT affect:
- Existing subscriptions (quota already set in `billing_usage`)
- New subscriptions (may use hardcoded `PRICING` config)
- Quota display (reads from `billing_usage`, not `plan_items`)

**Critical Gap:** Admin quota edits may have NO EFFECT on actual quotas

---

### C.5 Exact Missing Links (File + Line Level)

#### Missing Link 1: Quota Mapping Documentation
- **Files:** All code generation APIs
- **Gap:** No clear documentation of which quota type is consumed by which API
- **Fix Needed:** Document mapping:
  - UNIT → Unit label generation API
  - BOX → Box SSCC generation
  - CARTON → Carton SSCC generation
  - PALLET → Pallet SSCC generation
  - SSCC → Consolidated (all SSCC levels?)

#### Missing Link 2: Admin Quota Edit → Actual Quota
- **File:** `app/api/admin/subscription-plans/route.ts` (plan update)
- **Gap:** When admin edits `plan_items.limit_value`, it doesn't update:
  - Existing `billing_usage` records
  - `PRICING` config (if hardcoded)
- **Fix Needed:** Either:
  - Update `billing_usage` when plan_items change, OR
  - Read quotas from `plan_items` instead of hardcoded config

#### Missing Link 3: Quota Source Standardization
- **Files:** Multiple (config, billing_usage, plan_items)
- **Gap:** Three different sources for quota limits
- **Fix Needed:** Decide single source of truth:
  - Option A: `plan_items` (admin-editable)
  - Option B: `PRICING` config (hardcoded)
  - Option C: `billing_usage` (runtime)

---

## SUMMARY OF GAPS

### Company-Direct Discount (3 Missing Links)
1. Pricing page doesn't fetch/display discount
2. Payment amount doesn't apply discount
3. Invoice doesn't include discount

### Admin Analytics (4 Missing Links)
1. Overview counts subscriptions instead of companies
2. Overview revenue ignores discounts
3. Revenue analytics ignores discounts
4. Add-on revenue ignores discounts (if applicable)

### Subscription Quota (3 Missing Links)
1. Quota type → code generation mapping unclear
2. Admin quota edits don't affect actual quotas
3. Multiple quota sources (not standardized)

---

## MINIMAL FIX PLAN (File + Line Level)

### Fix 1: Company-Direct Discount - Pricing Page
- **File:** `app/pricing/page.tsx`
- **Action:** Add API call to fetch company discount, calculate discounted price, display in UI
- **Lines:** ~200-300 (Plan card rendering)

### Fix 2: Company-Direct Discount - Payment
- **Files:** Payment creation APIs
- **Action:** Fetch discount, apply to payment amount, store in metadata
- **Lines:** Before Razorpay order creation

### Fix 3: Company-Direct Discount - Invoice
- **Files:** Invoice generation APIs
- **Action:** Fetch discount, apply to invoice amount, include in breakdown
- **Lines:** Invoice creation logic

### Fix 4: Admin Analytics - Company Count
- **File:** `app/api/admin/analytics/overview/route.ts`
- **Line:** 13-19
- **Action:** Change to `COUNT(DISTINCT company_id)`

### Fix 5: Admin Analytics - Discount in Revenue
- **Files:** 
  - `app/api/admin/analytics/overview/route.ts` (line 26-59)
  - `app/api/admin/analytics/revenue/route.ts` (line 13-78)
- **Action:** Join `companies` table, fetch discount, apply in revenue calculation

### Fix 6: Quota Mapping Documentation
- **Files:** Code generation APIs
- **Action:** Document which quota type each API consumes
- **Lines:** Add comments/documentation

### Fix 7: Admin Quota Edit → Actual Quota
- **File:** `app/api/admin/subscription-plans/route.ts`
- **Action:** When `plan_items.limit_value` changes, update `billing_usage` for affected companies OR read from `plan_items` instead of hardcoded config

---

## CONFIRMATION CHECKLIST

After fixes are applied, confirm:

- [ ] Company-direct discount displayed on pricing page
- [ ] Company-direct discount applied to payment amount
- [ ] Company-direct discount included in invoices
- [ ] Admin analytics overview shows correct company count
- [ ] Admin analytics revenue includes discounts
- [ ] Quota type mapping clearly documented
- [ ] Admin quota edits affect actual quotas
- [ ] Trial logic remains untouched ✅

---

**END OF REVIEW REPORT**
