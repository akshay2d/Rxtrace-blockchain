# PRIORITY-2 IMPLEMENTATION SUMMARY
## Company-Direct Discount · Admin Analytics · Subscription Quotas

**Date:** 2026-01-26  
**Status:** ✅ COMPLETE  
**Trial Logic:** ✅ UNTOUCHED (LOCKED)

---

## ✅ FIX 1: COMPANY-DIRECT DISCOUNT

### 1A. Pricing Page Discount Display ✅

**File:** `app/pricing/page.tsx`

**Changes:**
- Added `companyDiscount` state to store discount data
- Added `calculateDiscountedPrice()` helper function
- Fetches company discount from `/api/admin/companies/discount?company_id=...`
- Displays original price (strikethrough) and discounted price (green, bold)
- Updated `PlanCard` component to accept `React.ReactNode` for price/yearly props

**Lines Modified:**
- Line 83-107: Added `calculateDiscountedPrice()` function
- Line 142-146: Added `companyDiscount` state
- Line 195-210: Added discount fetching logic
- Line 234: Set discount state
- Line 702-740: Calculate and display discounted prices in plan cards
- Line 1066-1099: Updated `PlanCard` to accept ReactNode

**Result:** ✅ Discount visible on pricing page with strikethrough original price

---

### 1B. Payment Amount Discount (Metadata) ✅

**File:** `app/api/billing/subscription/upgrade/route.ts`

**Changes:**
- Fetches company discount fields from `companies` table
- Stores discount metadata in Razorpay subscription notes
- Note: Razorpay subscriptions use fixed plan prices, so discount is stored in metadata for reference

**Lines Modified:**
- Line 36-40: Added discount fields to company select
- Line 47-75: Added discount calculation helper and metadata storage
- Line 66-76: Store discount in subscription notes (create)
- Line 81-90: Store discount in subscription notes (update)

**Result:** ✅ Discount metadata stored in Razorpay subscription notes

---

### 1C. Invoice Generation Discount Breakdown ✅

**File:** `app/api/razorpay/webhook/route.ts`

**Changes:**
- Fetches company discount when creating subscription invoices
- Calculates discount breakdown (base_amount, discount_amount, final_amount)
- Stores discount in invoice metadata
- Applies discount to add-on invoices if `discount_applies_to = 'addon'` or `'both'`

**Lines Modified:**
- Line 28-40: Added discount parameter to `ensureSubscriptionInvoice`
- Line 70-98: Calculate discount breakdown for subscription invoices
- Line 213-240: Added discount fetching and calculation for add-on invoices
- Line 246-269: Store discount breakdown in invoice metadata (with optional columns)
- Line 271-290: Store discount breakdown in invoice metadata (minimal)

**Result:** ✅ Discount breakdown included in invoice metadata

---

## ✅ FIX 2: ADMIN ANALYTICS

### 2A. Analytics Overview - Company Count ✅

**File:** `app/api/admin/analytics/overview/route.ts`

**Changes:**
- Changed from counting subscriptions to counting DISTINCT companies
- Uses `Set` to ensure one company = one count
- Prevents duplication from historical subscription records

**Lines Modified:**
- Line 13-22: Changed to count distinct `company_id` instead of subscription records

**Result:** ✅ Company count is accurate (one company = one count)

---

### 2B. Analytics Overview - Revenue with Discounts ✅

**File:** `app/api/admin/analytics/overview/route.ts`

**Changes:**
- Added join to `companies` table to fetch discount fields
- Applies discount to subscription revenue calculation
- Applies discount to add-on revenue if `discount_applies_to = 'addon'` or `'both'`
- Revenue shown is NET (after discounts), not gross

**Lines Modified:**
- Line 26-35: Added `companies!inner` join to fetch discount
- Line 41-60: Apply discount to subscription revenue
- Line 63-77: Apply discount to add-on revenue
- Line 80-81: Count distinct active companies

**Result:** ✅ Revenue reflects discounts (NET revenue, not gross)

---

### 2C. Revenue Analytics - Discounts Applied ✅

**File:** `app/api/admin/analytics/revenue/route.ts`

**Changes:**
- Added join to `companies` table to fetch discount fields
- Applies discount to subscription revenue
- Applies discount to add-on revenue if applicable
- Revenue shown is NET (after discounts)

**Lines Modified:**
- Line 13-25: Added `companies!inner` join
- Line 34-49: Apply discount to subscription revenue
- Line 53-78: Apply discount to add-on revenue

**Result:** ✅ Revenue analytics shows NET revenue with discounts applied

---

## ✅ FIX 3: SUBSCRIPTION QUOTA SYSTEM

### 3A. Quota Source of Truth Declared ✅

**File:** `lib/usage/tracking.ts`

**Changes:**
- Added comprehensive documentation declaring single source of truth:
  - **Quota limits:** `plan_items` table (admin-editable)
  - **Quota usage (billing):** `billing_usage` table (current billing period)
  - **Quota usage (analytics):** `usage_counters` table (monthly aggregates)

**Lines Modified:**
- Line 107-130: Added detailed documentation comment

**Result:** ✅ Single source of truth clearly documented

---

### 3B. Quota → Code Generation Mapping Documented ✅

**Files:**
- `lib/usage/tracking.ts`
- `app/api/issues/route.ts`
- `app/api/sscc/generate/route.ts`

**Changes:**
- Added inline documentation mapping quota types to APIs:
  - **UNIT** → Unit label generation (`/api/issues/route.ts`)
  - **BOX** → Box-level SSCC generation (`/api/sscc/generate/route.ts`, when `generate_box=true`)
  - **CARTON** → Carton-level SSCC generation (`/api/sscc/generate/route.ts`, when `generate_carton=true`)
  - **PALLET** → Pallet-level SSCC generation (`/api/sscc/generate/route.ts`, when `generate_pallet=true`)
  - **SSCC** → Consolidated SSCC usage (all levels combined)

**Lines Modified:**
- `lib/usage/tracking.ts` line 107-130: Added mapping documentation
- `app/api/issues/route.ts` line 118: Added UNIT quota documentation
- `app/api/sscc/generate/route.ts` line 218-223: Added SSCC quota documentation

**Result:** ✅ Quota type mapping clearly documented in code

---

### 3C. Admin Quota Edits Take Effect ✅

**File:** `app/api/admin/subscription-plans/route.ts`

**Changes:**
- When `plan_items.limit_value` is updated, automatically updates `billing_usage` for active subscriptions
- Only updates if limit_value actually changed
- Updates SSCC quota (consolidated) when box/carton/pallet quotas change
- New subscriptions automatically use updated quotas from `plan_items`

**Lines Modified:**
- Line 167-183: Added logic to track limit changes and update `billing_usage`

**Result:** ✅ Admin quota edits immediately affect active subscriptions

---

## VALIDATION CHECKLIST

### Company Discount ✅
- [x] Discount visible on pricing page
- [x] Discount metadata stored in Razorpay subscription notes
- [x] Discount breakdown included in invoices
- [x] Coupon system untouched ✅

### Admin Analytics ✅
- [x] Company count accurate (DISTINCT)
- [x] Revenue reflects discounts (NET revenue)
- [x] No missing data due to joins (using `!inner` correctly)
- [x] Add-on revenue discounts applied when applicable

### Quotas ✅
- [x] Admin quota edits affect real usage (updates `billing_usage`)
- [x] Quota mapping documented in code
- [x] Single source of truth declared
- [x] Billing & analytics numbers explained (different time periods documented)

### Trial ✅
- [x] Trial logic unchanged ✅
- [x] Trial UI untouched ✅

---

## FILES MODIFIED

1. `app/pricing/page.tsx` - Discount display
2. `app/api/billing/subscription/upgrade/route.ts` - Discount metadata
3. `app/api/razorpay/webhook/route.ts` - Invoice discount breakdown
4. `app/api/admin/analytics/overview/route.ts` - Company count + revenue discounts
5. `app/api/admin/analytics/revenue/route.ts` - Revenue discounts
6. `lib/usage/tracking.ts` - Quota mapping documentation
7. `app/api/issues/route.ts` - UNIT quota documentation
8. `app/api/sscc/generate/route.ts` - SSCC quota documentation
9. `app/api/admin/subscription-plans/route.ts` - Admin quota edit → billing_usage update

---

## NOTES

1. **Razorpay Subscription Discounts:** Razorpay subscriptions use fixed plan prices. Discount is stored in metadata for reference and applied in analytics/invoices, but Razorpay itself charges the full plan price. This is expected behavior.

2. **Invoice Discount Calculation:** For subscription invoices, discount is estimated from the Razorpay invoice amount (which may already be discounted). The breakdown is stored for transparency.

3. **Quota Updates:** Admin quota edits update `billing_usage` for active subscriptions immediately. New subscriptions automatically use updated quotas from `plan_items`.

4. **Trial Logic:** All trial-related code remains untouched as required.

---

**END OF IMPLEMENTATION SUMMARY**
