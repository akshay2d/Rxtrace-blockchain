# REVIEW REPORT: Trial Status, Analytics, and Discount Systems

**Date:** 2026-01-26  
**Review Type:** Gap Identification Only (No Code Changes)  
**Company in Question:** Varsha Food and Cosmetics (akshaytilwanker@gmail.com)

---

## EXECUTIVE SUMMARY

This review identifies **8 critical gaps** preventing proper display of trial companies, analytics data, company-direct discounts, quota consistency, and trial UI visibility:

1. **Trial Status Mismatch:** Trial stored in `companies.subscription_status` but admin queries only `company_subscriptions`
2. **Analytics Overview Missing Data:** Queries `company_subscriptions` only, excludes companies without subscription records
3. **Revenue Analytics Missing Data:** Uses `!inner` join that excludes subscriptions without matching plans
4. **Company-Direct Discount Not Applied:** Discount stored in `companies` table but never applied during billing/pricing
5. **₹5 Trial Payment Flow Inconsistency:** `company_subscriptions` record creation can fail silently, leaving trial only in `companies` table
6. **Quota Type Mapping Inconsistency:** Different APIs read from different sources (`billing_usage` vs `usage_counters` vs `plan_items`), causing mismatched numbers
7. **Settings Page Missing Trial UI:** No Start Trial button, trial status, or trial management in Settings page
8. **Usage & Cost Audit Not Visible:** No indicative cost display during trial, no historical usage view after trial expiry

---

## PART A: TRIAL STATE — SOURCE OF TRUTH ANALYSIS

### A.1 Where Trial Status is Stored

**TWO separate locations:**

1. **`companies.subscription_status`** (lowercase 'trial')
   - Updated by: `app/api/trial/activate/route.ts` (line 161, 526)
   - Field type: TEXT
   - Value: `'trial'` (lowercase)

2. **`company_subscriptions.status`** (uppercase 'TRIAL')
   - Updated by: `app/api/trial/activate/route.ts` (line 324, 629)
   - Field type: TEXT with CHECK constraint
   - Value: `'TRIAL'` (uppercase)

### A.2 Where Trial Status is Read

**Admin Dashboard (`app/admin/page.tsx`):**
- **Line 79-82:** Queries `companies` table only
- **Does NOT filter by subscription_status**
- **Does NOT show trial count** - only shows "Total Companies"
- **Gap:** No trial-specific display or count

**Analytics Overview API (`app/api/admin/analytics/overview/route.ts`):**
- **Line 13-15:** Queries `company_subscriptions` table ONLY
- **Line 20:** Filters by `status === 'TRIAL'` (uppercase)
- **Gap:** If company has `companies.subscription_status = 'trial'` but NO `company_subscriptions` record, it's excluded

**Analytics Subscriptions API (`app/api/admin/analytics/subscriptions/route.ts`):**
- **Line 13-15:** Queries `company_subscriptions` table ONLY
- **Line 20-25:** Counts by status from `company_subscriptions`
- **Gap:** Same as Overview - excludes companies without subscription records

**User Billing Page (`app/dashboard/billing/page.tsx`):**
- **Line 101:** Uses `useSubscription()` hook
- **Hook queries:** `app/api/user/subscription/route.ts`
- **Line 28-35:** Queries `company_subscriptions` table
- **Works correctly IF** `company_subscriptions` record exists

### A.3 Mismatch Explanation

**Root Cause:**
- Trial activation (`app/api/trial/activate/route.ts`) updates BOTH tables
- BUT: If `company_subscriptions` record creation fails (line 331-335, 637-640), only `companies.subscription_status` is updated
- Admin analytics ONLY query `company_subscriptions` table
- Result: Companies with trial in `companies` but missing `company_subscriptions` record are invisible to admin

**Why Varsha Food Shows 0 Trial:**
- Company likely has `companies.subscription_status = 'trial'`
- But `company_subscriptions` record is missing or has wrong status
- Admin queries `company_subscriptions` → finds 0 TRIAL records

---

## PART B: WHY ADMIN SHOWS "0 TRIAL"

### B.1 Admin Dashboard Trial Count

**File:** `app/admin/page.tsx`

**Current Implementation:**
- **Line 79-82:** Fetches ALL companies (no status filter)
- **Line 100:** Sets `totalCompanies = companiesData?.length`
- **No trial count calculation**
- **No trial-specific display**

**Gap:** Dashboard doesn't show trial count at all. It only shows total companies.

### B.2 Analytics Overview Trial Count

**File:** `app/api/admin/analytics/overview/route.ts`

**Current Implementation:**
- **Line 13-15:** 
  ```typescript
  const { data: subscriptions } = await supabase
    .from('company_subscriptions')
    .select('status');
  ```
- **Line 20:** 
  ```typescript
  const trialCompanies = subscriptions?.filter((s: any) => s.status === 'TRIAL').length || 0;
  ```

**Why It Shows 0:**
1. Query ONLY looks at `company_subscriptions` table
2. If Varsha Food has trial in `companies.subscription_status` but NO `company_subscriptions` record → excluded
3. If `company_subscriptions` record exists but `status !== 'TRIAL'` → excluded
4. If `company_subscriptions` record has `plan_id = null` and join fails → excluded

**Missing Logic:**
- Does NOT check `companies.subscription_status`
- Does NOT handle companies without `company_subscriptions` records
- Does NOT account for case mismatch ('trial' vs 'TRIAL')

---

## PART C: ANALYTICS WIRING REVIEW

### C.1 Analytics Overview Data Source

**File:** `app/api/admin/analytics/overview/route.ts`

**Data Sources:**
1. **Trial/Paused/Cancelled counts:** `company_subscriptions` table (line 13-15)
2. **Revenue (MRR/ARR):** `company_subscriptions` with `!inner` join to `subscription_plans` (line 25-33)
3. **Add-on revenue:** `company_add_ons` with `!inner` join to `add_ons` (line 52-58)
4. **Usage:** `usage_counters` table (line 76-79)

**Issues Identified:**

**Issue 1: Missing Companies Without Subscription Records**
- Query at line 13-15 only gets companies that have `company_subscriptions` records
- Companies with trial in `companies` table but missing subscription record are excluded
- **Fix Required:** Join with `companies` table or query both sources

**Issue 2: Revenue Query Uses `!inner` Join**
- Line 27-33: `subscription_plans!inner(...)`
- `!inner` means: Exclude subscriptions without matching plans
- If `plan_id` is null or plan doesn't exist → subscription excluded from revenue
- **Fix Required:** Use left join or handle null plan_id

**Issue 3: Total Companies Count is Wrong**
- Line 19: `totalCompanies = subscriptions?.length`
- This counts subscriptions, not companies
- If a company has multiple subscriptions (shouldn't happen but possible) → double count
- **Fix Required:** Count distinct companies or query `companies` table

### C.2 Analytics Revenue Data Source

**File:** `app/api/admin/analytics/revenue/route.ts`

**Data Sources:**
1. **Subscriptions:** `company_subscriptions` with `!inner` join to `subscription_plans` (line 13-25)
2. **Add-ons:** `company_add_ons` with `!inner` join to `add_ons` (line 53-63)
3. **Refunds:** `refunds` table (line 81-84)

**Issues Identified:**

**Issue 1: `!inner` Join Excludes Missing Plans**
- Line 18: `subscription_plans!inner(...)`
- If subscription has `plan_id = null` → excluded
- If plan doesn't exist → excluded
- **Result:** Revenue undercounted if any subscription has missing plan

**Issue 2: Status Filter May Exclude Valid Trials**
- Line 25: `.in('status', ['ACTIVE', 'TRIAL'])`
- This is correct, BUT if subscription record doesn't exist → excluded
- **Fix Required:** Ensure all trials have subscription records

**Issue 3: No Discount Application**
- Revenue calculation (line 34-50) does NOT apply discounts
- Company-direct discounts (`companies.discount_*`) are never considered
- External discounts (`company_discounts`) are never considered
- **Result:** Revenue shown is gross, not net

### C.3 Analytics Subscriptions Data Source

**File:** `app/api/admin/analytics/subscriptions/route.ts`

**Data Sources:**
1. **All subscriptions:** `company_subscriptions` table (line 13-15)

**Issues Identified:**

**Issue 1: Only Queries `company_subscriptions`**
- Does NOT account for companies with trial in `companies` table but missing subscription record
- **Result:** Trial count undercounted

---

## PART D: DISCOUNT SYSTEMS REVIEW

### D.1 External/Coupon Discount System (WORKING ✅)

**Storage:**
- **Table:** `company_discounts` (junction table)
- **Links:** `company_id` → `discount_id` → `discounts` table
- **Fields:** `discounts.code`, `discounts.type`, `discounts.value`

**Application:**
- **User subscription API:** `app/api/user/subscription/route.ts`
- **Line 71-77:** Fetches `company_discounts` with `discounts` join
- **Returns:** Discounts in response (but not applied to pricing)

**Status:** ✅ **WORKING** - Data is stored and retrieved correctly

### D.2 Company-Direct Discount System (NOT WORKING ❌)

**Storage:**
- **Table:** `companies` table
- **Fields:**
  - `companies.discount_type` (TEXT: 'percentage' | 'flat')
  - `companies.discount_value` (DECIMAL)
  - `companies.discount_applies_to` (TEXT: 'subscription' | 'addon' | 'both')
  - `companies.discount_notes` (TEXT)

**API for Setting Discount:**
- **File:** `app/api/admin/companies/discount/route.ts`
- **PUT endpoint:** Updates `companies.discount_*` fields (line 91-96)
- **GET endpoint:** Retrieves discount fields (line 192-225)
- **DELETE endpoint:** Clears discount fields (line 125-189)

**Status:** ✅ **STORAGE WORKS** - Admin can set/update/delete company discounts

### D.3 Where Discount Should Apply (MISSING ❌)

**Expected Application Points:**

1. **Pricing Page (`app/pricing/page.tsx`):**
   - **Gap:** No code found that reads `companies.discount_*` fields
   - **Gap:** No discount calculation in plan price display
   - **Result:** Users see full price, not discounted price

2. **Billing/Subscription APIs:**
   - **Gap:** No code found in `app/api/billing/**` that applies company-direct discounts
   - **Gap:** No discount calculation in invoice generation
   - **Result:** Invoices show full price, not discounted price

3. **Razorpay Payment:**
   - **Gap:** No discount applied before creating Razorpay order
   - **Result:** Full amount charged, discount never applied

**Exact Missing Link:**
- **File:** `app/pricing/page.tsx` - Missing discount fetch and price calculation
- **File:** `app/api/billing/subscription/upgrade/route.ts` - Missing discount application
- **File:** `app/api/trial/activate/route.ts` - Missing discount application (if applicable)
- **File:** Any invoice generation - Missing discount application

**Why It Doesn't Work:**
- Discount is stored in `companies` table ✅
- Discount can be set via admin API ✅
- Discount is NEVER read or applied during:
  - Price display ❌
  - Payment calculation ❌
  - Invoice generation ❌

---

## SUMMARY OF GAPS

### Gap 1: Trial Status Source Mismatch
- **Problem:** Admin queries `company_subscriptions` only, but trial may exist in `companies.subscription_status`
- **Impact:** Varsha Food (and others) missing from trial count
- **Fix Location:** `app/api/admin/analytics/overview/route.ts` line 13-20

### Gap 2: Analytics Overview Missing Companies
- **Problem:** Only counts companies with `company_subscriptions` records
- **Impact:** Companies with trial but missing subscription record excluded
- **Fix Location:** `app/api/admin/analytics/overview/route.ts` line 13-20

### Gap 3: Revenue Analytics Excludes Missing Plans
- **Problem:** `!inner` join excludes subscriptions without matching plans
- **Impact:** Revenue undercounted if any subscription has null/missing plan_id
- **Fix Location:** `app/api/admin/analytics/revenue/route.ts` line 18

### Gap 4: Company-Direct Discount Never Applied
- **Problem:** Discount stored but never read/applied during pricing/billing
- **Impact:** Admin sets discount but users still see/pay full price
- **Fix Locations:**
  - `app/pricing/page.tsx` - Add discount fetch and price calculation
  - `app/api/billing/subscription/upgrade/route.ts` - Apply discount before payment
  - Invoice generation - Apply discount to invoice amount

---

## MINIMAL FIX PLAN (File + Line-Level)

### Fix 1: Trial Count in Analytics Overview
**File:** `app/api/admin/analytics/overview/route.ts`
- **Line 13-20:** Replace single-source query with dual-source query
- **Change:** Query both `company_subscriptions` AND `companies.subscription_status = 'trial'`
- **Merge:** Combine results, deduplicate by company_id

### Fix 2: Total Companies Count
**File:** `app/api/admin/analytics/overview/route.ts`
- **Line 19:** Change from `subscriptions?.length` to actual company count
- **Change:** Query `companies` table for total count

### Fix 3: Revenue Analytics Join
**File:** `app/api/admin/analytics/revenue/route.ts`
- **Line 18:** Change `!inner` to left join (remove `!inner`)
- **Change:** Handle null plan_id gracefully

### Fix 4: Company-Direct Discount Application
**File:** `app/pricing/page.tsx`
- **Add:** Fetch company discount fields when loading plans
- **Add:** Calculate discounted price for display
- **File:** `app/api/billing/subscription/upgrade/route.ts`
- **Add:** Fetch company discount before creating Razorpay order
- **Add:** Apply discount to amount before payment

---

## CONFIRMATION CHECKLIST

After fixes are applied, confirm:

- [ ] Varsha Food and Cosmetics appears as TRIAL in admin dashboard
- [ ] Trial count in Analytics → Overview shows correct number (≥ 1)
- [ ] Analytics → Overview shows data (not blank)
- [ ] Analytics → Revenue shows MRR/ARR data
- [ ] Company-direct discount applied to pricing page display
- [ ] Company-direct discount applied to payment amount
- [ ] Company-direct discount reflected in invoices
- [ ] External/coupon discount system remains untouched and working

---

## NOTES

- **No new tables required** - All data exists, just needs proper querying
- **No new discount types** - Only need to apply existing company-direct discount
- **No pricing UI changes** - Only need to show discounted price (same UI, different calculation)
- **No subscription logic redesign** - Only need to apply discount before payment

---

---

## PART E: ₹5 TRIAL PAYMENT FLOW REVIEW

### E.1 Endpoint Handling ₹5 Trial Payment

**File:** `app/api/trial/activate/route.ts`

**Function:** `handleSimpleTrialActivation()` (line 42-379)

**Flow:**
1. **Payment Verification (Line 72-150):**
   - Fetches payment from Razorpay API
   - Verifies: status = 'captured', amount = ₹5 (500 paise), currency = INR
   - **Razorpay Mandate:** Payment itself creates the mandate (Razorpay handles this)

2. **Company Update (Line 158-172):**
   - Updates `companies.subscription_status = 'trial'` (lowercase)
   - Updates `companies.trial_end_date` (15 days from now)
   - Updates `companies.trial_activated_at`
   - **Always succeeds** (if company exists)

3. **Billing Transaction Record (Line 175-186):**
   - Inserts into `billing_transactions` table
   - **Always succeeds** (non-blocking)

4. **Invoice Creation (Line 188-268):**
   - Creates invoice in `billing_invoices` table
   - **May fail silently** (line 247-267) - continues even if invoice creation fails

5. **Subscription Record Creation (Line 270-351):**
   - **CRITICAL POINT:** Attempts to create `company_subscriptions` record
   - **Line 308-313:** Checks for existing subscription
   - **Line 316-335:** Creates new subscription if missing
   - **Line 331-335:** **FAILS SILENTLY** - logs error but continues
   - **Line 336-339:** If no plan ID found, **skips creation entirely**

### E.2 Where Payment Success Updates Data

**Payment Callback:** No separate callback endpoint found
- Payment is verified **synchronously** during trial activation
- All updates happen in `handleSimpleTrialActivation()` function

**⚠️ CRITICAL DISCREPANCY:**
- **Business Rules State:** "Trial has NO PAYMENT"
- **Current Code:** Verifies ₹5 payment from Razorpay (line 72-150)
- **Impact:** If business rule is correct (no payment), payment verification should be removed
- **If code is correct:** Business rules need clarification (₹5 is for mandate setup, not payment)

**Data Updates:**
1. ✅ `companies.subscription_status = 'trial'` (always updated)
2. ✅ `companies.trial_end_date` (always updated)
3. ✅ `companies.trial_activated_at` (always updated)
4. ✅ `billing_transactions` (always inserted)
5. ⚠️ `billing_invoices` (may fail silently)
6. ⚠️ `company_subscriptions` (may fail silently)

### E.3 Company Subscriptions Record Creation

**Creation Logic:**
- **Line 308-313:** Checks if subscription already exists
- **Line 316-335:** Creates if missing (but can fail)
- **Line 340-351:** Updates existing if status is not TRIAL

**Failure Scenarios:**
1. **No Plan ID Found (Line 336-339):**
   - If `starterPlanId` is null → subscription record NOT created
   - Error logged but trial activation continues
   - Result: Trial in `companies` but NO `company_subscriptions` record

2. **Database Insert Error (Line 331-335):**
   - If `subError` occurs → subscription record NOT created
   - Error logged but trial activation continues
   - Result: Trial in `companies` but NO `company_subscriptions` record

3. **Plan Lookup Failure (Line 275-302):**
   - Multiple fallback queries to find plan
   - If all fail → `starterPlanId = null` → no subscription record

**Why Varsha Food May Be Missing:**
- Trial activation succeeded in updating `companies` table
- But `company_subscriptions` record creation failed (plan lookup or insert error)
- Admin queries only `company_subscriptions` → finds 0 TRIAL records

**⚠️ CRITICAL DISCREPANCY:**
- **Business Rules State:** `plan_id = NULL` during trial
- **Current Code:** Sets `plan_id = starterPlanId` (line 323, 628 in trial/activate/route.ts)
- **Impact:** If business rule is correct, code needs to be changed to set `plan_id = null`
- **If code is correct:** Business rules need clarification

---

## PART F: QUOTA & USAGE DEMARCATION REVIEW

### F.1 Quota Storage Tables

**Three separate storage locations:**

1. **`billing_usage` table:**
   - Fields: `unit_labels_quota`, `box_labels_quota`, `carton_labels_quota`, `pallet_labels_quota`, `sscc_labels_quota`
   - Usage: `unit_labels_used`, `box_labels_used`, `carton_labels_used`, `pallet_labels_used`, `sscc_labels_used`
   - **Used by:** `app/api/dashboard/stats/route.ts` (line 49, 175-180)
   - **Purpose:** Current billing period quotas and usage

2. **`plan_items` table:**
   - Fields: `limit_value`, `limit_type` (HARD/SOFT/NONE)
   - **Used by:** `lib/usage/tracking.ts` → `getUsageLimits()` (line 68-105)
   - **Purpose:** Plan-level quota limits (from subscription plan configuration)

3. **`usage_counters` table:**
   - Fields: `metric_type` (UNIT/BOX/CARTON/SSCC), `used_quantity`
   - **Used by:** `lib/usage/tracking.ts` → `getCurrentUsage()` (line 37-63)
   - **Used by:** `app/api/admin/analytics/overview/route.ts` (line 76-81)
   - **Purpose:** Aggregated monthly usage (from `usage_events`)

### F.2 Quota Type Mapping

**Code Generation Types → Quota Types:**

**Mapping Function:** `lib/usage/tracking.ts` → `mapLabelToMetricType()` (line 110-117)

1. **UNIT Quota:**
   - **Storage:** `billing_usage.unit_labels_quota` / `unit_labels_used`
   - **Usage Tracking:** `usage_counters.metric_type = 'UNIT'`
   - **Plan Items:** Label contains "unit" → maps to `UNIT`
   - **Code Type:** Unit code generation (individual product labels)

2. **BOX Quota:**
   - **Storage:** `billing_usage.box_labels_quota` / `box_labels_used`
   - **Usage Tracking:** `usage_counters.metric_type = 'BOX'`
   - **Plan Items:** Label contains "box" → maps to `BOX`
   - **Code Type:** Box-level code generation

3. **CARTON Quota:**
   - **Storage:** `billing_usage.carton_labels_quota` / `carton_labels_used`
   - **Usage Tracking:** `usage_counters.metric_type = 'CARTON'`
   - **Plan Items:** Label contains "carton" → maps to `CARTON`
   - **Code Type:** Carton-level code generation

4. **PALLET / SSCC Quota:**
   - **Storage:** 
     - `billing_usage.pallet_labels_quota` / `pallet_labels_used`
     - `billing_usage.sscc_labels_quota` / `sscc_labels_used` (consolidated)
   - **Usage Tracking:** `usage_counters.metric_type = 'SSCC'`
   - **Plan Items:** Label contains "pallet" OR "sscc" → maps to `SSCC`
   - **Code Type:** Pallet/SSCC code generation
   - **Note:** `sscc_labels_quota` is calculated as sum of box + carton + pallet (line 98 in `lib/billing/usage.ts`)

### F.3 Admin Quota Adjustment

**Location:** `app/admin/companies/[id]/page.tsx`

**Current Implementation:**
- **Line 144-156:** Displays usage meters with limits
- **Data Source:** `app/api/admin/companies/[id]/usage/route.ts`
- **Usage API (line 19):** Calls `getCurrentUsage()` → reads from `usage_counters`
- **Limits API (line 22):** Calls `getUsageLimits()` → reads from `plan_items`

**Gap:** Admin can view quotas but **no UI found** for adjusting quota values
- Quotas come from `plan_items` (plan-level)
- No company-specific quota override found
- Admin cannot adjust quotas per company

### F.4 User-Facing Quota Inconsistencies

**Billing Page (`app/dashboard/billing/page.tsx`):**
- **Line 388-427:** Shows "Quota Usage (Current Period)"
- **Data Source:** `app/api/dashboard/stats/route.ts`
- **Line 49:** Calls `ensureActiveBillingUsage()` → reads from `billing_usage` table
- **Line 175-180:** Returns `label_generation.unit`, `label_generation.box`, `label_generation.carton`, `label_generation.pallet`
- **Displays:** "X used" (no quota limit shown, only usage)

**Dashboard Stats API (`app/api/dashboard/stats/route.ts`):**
- **Line 49:** Uses `billing_usage` table (via `ensureActiveBillingUsage()`)
- **Returns:** `unit_labels_used`, `box_labels_used`, `carton_labels_used`, `pallet_labels_used`
- **Note:** Does NOT return quota limits, only usage

**Admin Company Usage API (`app/api/admin/companies/[id]/usage/route.ts`):**
- **Line 19:** Uses `usage_counters` table (via `getCurrentUsage()`)
- **Line 22:** Uses `plan_items` table (via `getUsageLimits()`)
- **Returns:** Usage from `usage_counters`, limits from `plan_items`

**Analytics Overview API (`app/api/admin/analytics/overview/route.ts`):**
- **Line 76-81:** Uses `usage_counters` table
- **Returns:** Aggregate `used_quantity` across all companies

**Inconsistency Sources:**

1. **Different Tables:**
   - Billing page → `billing_usage` table
   - Admin usage → `usage_counters` table
   - Analytics → `usage_counters` table

2. **Different Aggregation:**
   - `billing_usage`: Per billing period (trial or paid period)
   - `usage_counters`: Per calendar month (aggregated from `usage_events`)

3. **Different Quota Sources:**
   - Billing page: No quota limits shown (only usage)
   - Admin usage: Quota from `plan_items` (plan-level limits)
   - No company-specific quota overrides

4. **SSCC Quota Confusion:**
   - `billing_usage` has both `pallet_labels_quota` AND `sscc_labels_quota`
   - `sscc_labels_quota` = sum of box + carton + pallet (line 98 in `lib/billing/usage.ts`)
   - `usage_counters` uses `metric_type = 'SSCC'` (single type)
   - **Mismatch:** SSCC quota is calculated differently than stored

### F.5 Why Numbers Appear Inconsistent

**Billing Page vs Dashboard:**
- **Billing page:** Reads from `billing_usage` (current billing period)
- **Dashboard:** May read from different source (not confirmed in review)
- **Period Mismatch:** Billing period ≠ Calendar month

**Billing Page vs Analytics:**
- **Billing page:** `billing_usage.unit_labels_used` (billing period)
- **Analytics:** `usage_counters.used_quantity WHERE metric_type = 'UNIT'` (calendar month)
- **Result:** Different time periods = different numbers

**Admin Usage vs Billing Page:**
- **Admin usage:** `usage_counters` (calendar month) + `plan_items` (limits)
- **Billing page:** `billing_usage` (billing period) + no limits shown
- **Result:** Different sources = different numbers

---

## PART G: TRIAL & BILLING UI REVIEW

### G.1 Settings Page Review

**File:** `app/dashboard/settings/page.tsx`

**Current Implementation:**
- **Line 1-498:** Settings page exists
- **Sections:** User Profile, Password & Security, Tax Settings, Printer Settings, ERP Integration
- **NO Trial UI Found:**
  - No "Start Trial" button
  - No trial status display
  - No days left display
  - No Cancel/Resume Trial buttons

**Gap:** Settings page does NOT show any trial-related UI, despite business rules stating it should.

### G.2 Trial UI Visibility in Billing Page

**File:** `app/dashboard/billing/page.tsx`

**Current Implementation:**
- **Line 101:** Uses `useSubscription()` hook
- **Line 192-344:** Subscription display logic
- **Line 197-344:** Shows subscription card IF `subscription` exists
- **Line 327-344:** Shows "No active subscription" IF `subscription` is null

**Dependency Chain:**
1. `useSubscription()` hook → `app/lib/hooks/useSubscription.tsx`
2. Hook calls → `app/api/user/subscription/route.ts`
3. API queries → `company_subscriptions` table (line 28-35)
4. If no record → returns `subscription: null`
5. Billing page → shows "No active subscription" (line 327-344)

**Why Trial UI is Missing:**
- **Root Cause:** `company_subscriptions` record is missing for Varsha Food
- **Result:** `useSubscription()` returns `subscription: null`
- **Billing Page Logic:** Line 197 checks `subscription ? ... : ...`
- **When null:** Shows "No active subscription" instead of trial UI

**Trial UI Components (when subscription exists):**
- **Line 221-241:** Trial period display (days left)
- **Line 388-428:** Upgrade/Cancel/Resume buttons
- **All depend on:** `subscription.status === 'TRIAL'`

### G.3 useSubscription Hook Dependency

**File:** `lib/hooks/useSubscription.tsx`

**Current Implementation:**
- **Line 62-107:** `fetchSubscription()` function
- **Line 65:** Fetches from `/api/user/subscription`
- **Line 72:** Sets `subscription` state (can be null)
- **Line 117-142:** `isFeatureEnabled()` - allows code generation if `!subscription` (line 121)

**Dependency:**
- **Line 28-35 in API:** Queries `company_subscriptions` table ONLY
- **If record missing:** Returns `subscription: null`
- **Impact:** All UI components using `useSubscription()` see no subscription

### G.4 Trial UI Components Missing

**Expected (per business rules):**
1. **Settings Page:**
   - Start Trial button
   - Trial status display
   - Days left display
   - Cancel/Resume Trial buttons

2. **Billing Page:**
   - Upgrade plan button (always visible)
   - Cancel/Resume buttons (based on status)

**Current State:**
- **Settings Page:** ❌ No trial UI at all
- **Billing Page:** ⚠️ Trial UI exists but hidden when subscription record missing

---

## PART H: USAGE & COST AUDIT REVIEW

### H.1 Usage Tracking During Trial

**Tracking Tables:**
1. **`usage_events` table:**
   - **Fields:** `metric_type` (UNIT/BOX/CARTON/SSCC), `quantity`, `source`, `reference_id`
   - **Updated by:** Code generation APIs (when generation occurs)
   - **Purpose:** Individual generation events (audit trail)

2. **`usage_counters` table:**
   - **Fields:** `metric_type`, `used_quantity`, `period_start`, `period_end`
   - **Updated by:** Database trigger (auto-aggregates from `usage_events`)
   - **Purpose:** Monthly aggregated usage (for analytics)

3. **`billing_usage` table:**
   - **Fields:** `unit_labels_used`, `box_labels_used`, `carton_labels_used`, `pallet_labels_used`
   - **Updated by:** Code generation APIs (atomic increments)
   - **Purpose:** Current billing period usage (for quota enforcement)

**Trial Behavior (per business rules):**
- ✅ Usage IS tracked (all tables updated)
- ✅ Unlimited generation allowed (no enforcement)
- ✅ Cost calculation should work (audit only, no charge)

### H.2 Indicative Cost Calculation

**Current Implementation:**
- **Not Found:** No code found that calculates indicative cost during trial
- **Gap:** Business rules state "Cost calculation MUST work during trial (audit only, no charge)"
- **Missing:** No API or UI that shows "indicative cost" for trial users

**Expected (per business rules):**
- Show units generated
- Show indicative cost (what it would cost if not in trial)
- No actual charge
- Audit visibility after trial expiry

### H.3 Audit Visibility After Trial Expiry

**Current Implementation:**
- **Usage data exists:** In `usage_events`, `usage_counters`, `billing_usage`
- **No UI found:** That shows historical trial usage after expiry
- **Gap:** Business rules state "Confirm audit visibility after trial expiry"
- **Missing:** No clear UI/API that shows trial period usage after trial ends

---

## PART G: TRIAL & BILLING UI REVIEW (CONTINUED)

### G.1 Trial UI Visibility

**Billing Page (`app/dashboard/billing/page.tsx`):**

**Trial Status Display:**
- **Line 226-247:** Shows trial period info IF `subscription.status === 'TRIAL'`
- **Condition:** Requires `company_subscriptions` record with `status = 'TRIAL'`
- **Gap:** If subscription record missing → no trial UI shown

**Upgrade/Cancel/Resume Buttons:**
- **Line 388-428:** Button logic based on `subscription.status`
- **TRIAL:** Shows "Upgrade Plan" + "Cancel Subscription"
- **ACTIVE:** Shows "Change / Upgrade Plan" + "Cancel Subscription"
- **CANCELLED/PAUSED:** Shows "Resume Subscription"
- **Gap:** If `subscription` is null → shows "No active subscription" (line 327-344)

### G.2 Trial Logic Mixed with Billing

**Current Structure:**
- All trial UI is in billing page
- No separate trial activation page
- Trial status checked via `useSubscription()` hook
- Hook queries `company_subscriptions` table

**Gap:** If `company_subscriptions` record missing:
- Billing page shows "No active subscription"
- Trial UI not visible
- User cannot see trial status even though trial is active in `companies` table

---

## SUMMARY OF GAPS (UPDATED)

### Gap 1: Trial Status Source Mismatch
- **Problem:** Admin queries `company_subscriptions` only, but trial may exist in `companies.subscription_status`
- **Impact:** Varsha Food (and others) missing from trial count
- **Fix Location:** `app/api/admin/analytics/overview/route.ts` line 13-20

### Gap 2: Analytics Overview Missing Companies
- **Problem:** Only counts companies with `company_subscriptions` records
- **Impact:** Companies with trial but missing subscription record excluded
- **Fix Location:** `app/api/admin/analytics/overview/route.ts` line 13-20

### Gap 3: Revenue Analytics Excludes Missing Plans
- **Problem:** `!inner` join excludes subscriptions without matching plans
- **Impact:** Revenue undercounted if any subscription has null/missing plan_id
- **Fix Location:** `app/api/admin/analytics/revenue/route.ts` line 18

### Gap 4: Company-Direct Discount Never Applied
- **Problem:** Discount stored but never read/applied during pricing/billing
- **Impact:** Admin sets discount but users still see/pay full price
- **Fix Locations:**
  - `app/pricing/page.tsx` - Add discount fetch and price calculation
  - `app/api/billing/subscription/upgrade/route.ts` - Apply discount before payment
  - Invoice generation - Apply discount to invoice amount

### Gap 5: ₹5 Trial Payment Creates Inconsistent State
- **Problem:** `company_subscriptions` record creation can fail silently during trial activation
- **Impact:** Trial exists in `companies` but missing from `company_subscriptions` → invisible to admin
- **Fix Location:** `app/api/trial/activate/route.ts` line 308-351 (ensure record creation succeeds or fail trial activation)
- **Note:** Code currently sets `plan_id` to starterPlanId (line 323, 628), but business rules state `plan_id = NULL` during trial. This may need clarification.

### Gap 6: Quota Type Mapping Inconsistency
- **Problem:** Different APIs read from different tables (`billing_usage` vs `usage_counters` vs `plan_items`)
- **Impact:** Billing page, dashboard, and analytics show different numbers
- **Fix Locations:**
  - Standardize on single source of truth for quota limits
  - Align all APIs to read from same table/period
  - Clarify SSCC quota calculation (consolidated vs separate)

### Gap 7: Settings Page Missing Trial UI
- **Problem:** Settings page has no trial-related UI (Start Trial, status, days left, Cancel/Resume)
- **Impact:** Users cannot start trial or see trial status from Settings page
- **Fix Location:** `app/dashboard/settings/page.tsx` - Add trial UI section

### Gap 8: Usage & Cost Audit Not Visible
- **Problem:** No UI/API shows indicative cost during trial or historical usage after trial expiry
- **Impact:** Users cannot see what their trial usage would cost
- **Fix Location:** Add indicative cost calculation and display (location TBD)

### Gap 6: Quota Type Mapping Inconsistency
- **Problem:** Different APIs read from different tables (`billing_usage` vs `usage_counters` vs `plan_items`)
- **Impact:** Billing page, dashboard, and analytics show different numbers
- **Fix Locations:**
  - Standardize on single source of truth for quota limits
  - Align all APIs to read from same table/period
  - Clarify SSCC quota calculation (consolidated vs separate)

---

## MINIMAL FIX PLAN (File + Line-Level) - UPDATED

### Fix 1: Trial Count in Analytics Overview
**File:** `app/api/admin/analytics/overview/route.ts`
- **Line 13-20:** Replace single-source query with dual-source query
- **Change:** Query both `company_subscriptions` AND `companies.subscription_status = 'trial'`
- **Merge:** Combine results, deduplicate by company_id

### Fix 2: Total Companies Count
**File:** `app/api/admin/analytics/overview/route.ts`
- **Line 19:** Change from `subscriptions?.length` to actual company count
- **Change:** Query `companies` table for total count

### Fix 3: Revenue Analytics Join
**File:** `app/api/admin/analytics/revenue/route.ts`
- **Line 18:** Change `!inner` to left join (remove `!inner`)
- **Change:** Handle null plan_id gracefully

### Fix 4: Company-Direct Discount Application
**File:** `app/pricing/page.tsx`
- **Add:** Fetch company discount fields when loading plans
- **Add:** Calculate discounted price for display
- **File:** `app/api/billing/subscription/upgrade/route.ts`
- **Add:** Fetch company discount before creating Razorpay order
- **Add:** Apply discount to amount before payment

### Fix 5: Ensure Trial Subscription Record Creation
**File:** `app/api/trial/activate/route.ts`
- **Line 331-335:** Make subscription record creation failure block trial activation
- **OR:** Add retry logic or better error handling
- **Change:** Do not allow trial activation to succeed if subscription record creation fails

### Fix 6: Quota Source Standardization (Documentation Only)
**File:** Multiple files
- **Document:** Which table is source of truth for quota limits
- **Document:** Which table is source of truth for quota usage
- **Align:** All APIs to read from same source
- **Note:** This may require architectural decision on single source of truth

### Fix 7: Add Trial UI to Settings Page
**File:** `app/dashboard/settings/page.tsx`
- **Add:** Trial status section
- **Add:** Start Trial button (if trial not used)
- **Add:** Days left display (if trial active)
- **Add:** Cancel/Resume Trial buttons (if applicable)

### Fix 8: Add Indicative Cost Display
**File:** TBD (new component or extend billing page)
- **Add:** Fetch usage data during trial
- **Add:** Calculate indicative cost (plan price * usage / quota)
- **Add:** Display "Indicative Cost" (audit only, no charge)
- **Add:** Historical usage view after trial expiry

---

## CONFIRMATION CHECKLIST (UPDATED)

After fixes are applied, confirm:

- [ ] Varsha Food and Cosmetics appears as TRIAL in admin dashboard
- [ ] Trial count in Analytics → Overview shows correct number (≥ 1)
- [ ] Analytics → Overview shows data (not blank)
- [ ] Analytics → Revenue shows MRR/ARR data
- [ ] ₹5 paid trial flow creates `company_subscriptions` record reliably
- [ ] Company-direct discount applied to pricing page display
- [ ] Company-direct discount applied to payment amount
- [ ] Company-direct discount reflected in invoices
- [ ] Quota types clearly mapped (UNIT/BOX/CARTON/PALLET/SSCC)
- [ ] Billing page and dashboard show consistent quota numbers
- [ ] Settings page shows Start Trial button and trial status
- [ ] Trial UI visible in Settings & Billing pages
- [ ] Upgrade/Cancel/Resume buttons work correctly
- [ ] Indicative cost displayed during trial (audit only)
- [ ] Historical usage visible after trial expiry
- [ ] External/coupon discount system remains untouched and working

---

## NOTES

- **No new tables required** - All data exists, just needs proper querying
- **No new discount types** - Only need to apply existing company-direct discount
- **No pricing UI changes** - Only need to show discounted price (same UI, different calculation)
- **No subscription logic redesign** - Only need to apply discount before payment
- **₹5 trial payment flow unchanged** - Only ensure subscription record creation succeeds
- **Quota standardization** - May require architectural decision on single source of truth

---

---

## CRITICAL DISCREPANCIES REQUIRING CLARIFICATION

### Discrepancy 1: Trial Payment
- **Business Rules:** "Trial has NO PAYMENT"
- **Current Code:** Verifies ₹5 payment from Razorpay before activating trial
- **Question:** Is ₹5 considered "payment" or "mandate setup authorization"?
- **Impact:** If no payment required, payment verification code must be removed

### Discrepancy 2: Trial plan_id
- **Business Rules:** "plan_id = NULL" during trial
- **Current Code:** Sets `plan_id = starterPlanId` (line 323, 628)
- **Question:** Should trial subscription have `plan_id = null` or `plan_id = starterPlanId`?
- **Impact:** If null required, code must be changed (may affect revenue analytics)

### Discrepancy 3: Trial Subscription Record Requirement
- **Business Rules:** "company_subscriptions record MUST exist once trial is started"
- **Current Code:** Creates record but allows failure (line 331-335, 637-640)
- **Question:** Should trial activation fail if subscription record creation fails?
- **Impact:** If yes, error handling must be changed to block trial activation on failure

---

## FINAL REVIEW SUMMARY

### Root Causes Identified:

1. **Trial Status Mismatch:**
   - Trial stored in TWO places (`companies` + `company_subscriptions`)
   - Admin only queries `company_subscriptions`
   - If record creation fails → trial invisible to admin

2. **Analytics Missing Data:**
   - Queries only `company_subscriptions` (excludes companies without records)
   - Uses `!inner` joins (excludes subscriptions without plans)
   - Counts subscriptions instead of companies

3. **Trial UI Missing:**
   - Settings page has NO trial UI
   - Billing page depends on `company_subscriptions` record
   - If record missing → no trial UI shown

4. **Discount Not Applied:**
   - Company-direct discount stored but never read
   - No discount calculation in pricing/billing

5. **Quota Inconsistency:**
   - Different APIs read from different tables
   - Different time periods (billing period vs calendar month)
   - No single source of truth

6. **Usage Audit Missing:**
   - No indicative cost display during trial
   - No historical usage view after trial expiry

---

**END OF REVIEW REPORT**
