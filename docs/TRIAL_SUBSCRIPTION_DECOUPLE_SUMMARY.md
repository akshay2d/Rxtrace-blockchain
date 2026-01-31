# Trial / Subscription Decouple — Complete Line-Wise Development Summary

**Scope:** Trial stored only at company level. No trial row in `company_subscriptions`. Subscriptions = paid only.

---

## COMPLETE LINE-WISE CHANGE LOG

| File | Lines | Change |
|------|-------|--------|
| `supabase/migrations/20260227100000_company_trial_fields_decouple.sql` | 1–25 (new file) | Add companies.trial_started_at, trial_ends_at, trial_status; backfill from company_subscriptions; DELETE trial rows. |
| `app/api/trial/activate/route.ts` | 1–127 | Full rewrite. Company-only trial (trial_status, trial_ends_at). No company_subscriptions. |
| `app/api/trial/cancel/route.ts` | 1–48 (new file) | POST: set companies.trial_status=expired, subscription_status=expired. |
| `app/api/user/subscription/route.ts` | 1–120 | Full GET rewrite. Paid from company_subscriptions; trial from companies (synthetic object). Expire trial on read when trial_ends_at passed. |
| `app/api/billing/subscription/upgrade/route.ts` | 45 (select +trial_status), 237–239 (update +trial_status converted), 281–283 (same) | Company select adds trial_status. On upgrade set trial_status='converted' when was active. |
| `app/api/billing/subscription/cancel/route.ts` | 50–62 | When no subscription row: if trial_status=active → update companies (expired); else 404. Removed TRIAL/trialing company_subscriptions update. |
| `app/api/admin/fix-missing-subscriptions/route.ts` | 1–92 | Full rewrite. Only fix paid (subscription_status=active, razorpay_subscription_id). No trial rows. |
| `docs/TRIAL_SUBSCRIPTION_DECOUPLE_SUMMARY.md` | 1–end (new file) | This document. |

---

## 1. FILES CREATED (new)

| File | Purpose |
|------|--------|
| `supabase/migrations/20260227100000_company_trial_fields_decouple.sql` | Add `companies.trial_started_at`, `trial_ends_at`, `trial_status`; backfill from trial rows in `company_subscriptions`; DELETE trial rows from `company_subscriptions`. |
| `app/api/trial/cancel/route.ts` | POST: cancel trial (set `companies.trial_status = 'expired'`, `subscription_status = 'expired'`). No subscription row. |
| `docs/TRIAL_SUBSCRIPTION_DECOUPLE_SUMMARY.md` | This summary. |

---

## 2. FILES MODIFIED (with line-level changes)

### 2.1 `app/api/trial/activate/route.ts`

**Replaced entire file.** Trial activation:

- **No** `company_subscriptions` read or write.
- Reads `companies.trial_status`, `trial_ends_at`, `subscription_status`.
- If paid subscription row exists (ACTIVE/PAUSED) → 409.
- If trial already active and not expired → 409.
- Updates only `companies`: `trial_started_at`, `trial_ends_at`, `trial_status = 'active'`, `subscription_status = 'trial'`.
- No plan, no payment, no billing.

**Lines:** Full file rewrite (1–127). No `company_subscriptions` read/write. Only `companies` update.

---

### 2.2 `app/api/user/subscription/route.ts`

**Changes:**

- **Line 3:** Added import `getSupabaseAdmin`.
- **Lines 7–9:** Comment: access = paid from `company_subscriptions` OR company-level trial.
- **Lines 17–26:** Use `getSupabaseAdmin()` for company and subscription; company select includes `trial_started_at`, `trial_ends_at`, `trial_status`.
- **Lines 28–35:** Fetch `company_subscriptions` (paid only).
- **Lines 37–60:** If `subscriptionRaw` exists → build subscription object; `is_trial: false`.
- **Lines 61–95:** **Else** (no paid subscription): if `company.trial_status === 'active'` and `trial_ends_at > now` → return synthetic trial object (`id: trial-${companyId}`, `status: 'trialing'`, `trial_end`, `is_trial: true`). If trial ended → set `trial_status = 'expired'`, `subscription_status = 'expired'` and return null.
- **Lines 97–118:** Add-ons and discounts unchanged; return shape unchanged.

**Lines touched:** 1–120 (full GET handler logic).

---

### 2.3 `app/api/billing/subscription/upgrade/route.ts`

**Changes:**

- **Line 45:** Company select: add `trial_status`.
- **Lines 237–239:** After creating new paid subscription and updating company: add `...( (company as any)?.trial_status === 'active' ? { trial_status: 'converted' } : {} )` to companies update.
- **Lines 281–283:** After updating existing paid subscription: same `trial_status: 'converted'` when was active trial.

**Lines:** 45, 237–239, 281–283.

---

### 2.4 `app/api/billing/subscription/cancel/route.ts`

**Changes:**

- **Lines 50–62:** When `!subscription`: if `company.trial_status === 'active'` → update `companies` (`trial_status = 'expired'`, `subscription_status = 'expired'`) and return ok; else return 404 "No paid subscription to cancel".
- **Removed:** Block that updated `company_subscriptions` for TRIAL/trialing (no trial row anymore).

**Lines:** 50–62 (replace previous trial-handling block).

---

### 2.5 `app/api/admin/fix-missing-subscriptions/route.ts`

**Replaced entire file.**

- **No** creation of trial rows in `company_subscriptions`.
- Only companies with `subscription_status = 'active'` and `razorpay_subscription_id` not null.
- For each, if no `company_subscriptions` row → insert **paid** row (plan_id, status ACTIVE, is_trial false).
- Message: "Trial companies are not touched (trial is company-level only)."

**Lines:** 1–92 (full file).

---

## 3. FILES NOT CHANGED (in scope)

| File | Reason |
|------|--------|
| `app/middleware.ts` | Already allows `subscription_status` in `['trial','trialing','active','paid','live']`. Trial sets `subscription_status = 'trial'`; expired sets `'expired'` (already disallowed). No change. |
| `lib/hooks/useSubscription.tsx` | Consumes `/api/user/subscription`; API still returns same shape (subscription or synthetic trial). No change. |
| `components/subscription/SubscriptionBanner.tsx` | Uses `status === 'trialing'`; API returns that for trial. No change. |
| `app/dashboard/billing/page.tsx` | Uses `subscription.status === 'trialing'` and `trial_end`; API provides both. No change. |
| `app/api/billing/subscription/resume/route.ts` | Only acts on `company_subscriptions` (paid). No trial row. No change. |

---

## 4. MIGRATION BEHAVIOUR

**File:** `supabase/migrations/20260227100000_company_trial_fields_decouple.sql`

- **Lines 1–12:** Add `companies.trial_started_at`, `trial_ends_at`, `trial_status`; CHECK `trial_status` IN ('active','expired','converted').
- **Lines 14–22:** Backfill: UPDATE companies from `company_subscriptions` where `status IN ('TRIAL','trialing')` (set trial_started_at, trial_ends_at, trial_status).
- **Line 25:** DELETE from `company_subscriptions` where `status IN ('TRIAL','trialing')`.

---

## 5. VERIFICATION CHECKLIST

1. **New company → Start trial**  
   No row in `company_subscriptions`. Companies: `trial_status = 'active'`, `trial_ends_at` set, `subscription_status = 'trial'`. App access granted.

2. **Trial company → No payment**  
   Access until `trial_ends_at`. Then API sets `trial_status = 'expired'`, `subscription_status = 'expired'`; user redirected to pricing; upgrade/cancel options as per UI.

3. **Trial company → Subscribe to paid plan**  
   Upgrade creates row in `company_subscriptions` and sets `companies.trial_status = 'converted'`, `subscription_status = 'active'`. Billing runs on subscription.

4. **Trial cancel (mid-trial)**  
   POST `/api/trial/cancel` or cancel from billing: `trial_status = 'expired'`, `subscription_status = 'expired'`. No `company_subscriptions` row involved.

5. **If any trial requires a subscription row → FIX FAILED.**  
   Trial is company-level only; no trial row in `company_subscriptions`.

---

## 6. SUMMARY TABLE

| Item | Before | After |
|------|--------|--------|
| Trial storage | Row in `company_subscriptions` (plan_id null, is_trial, trialing) | `companies.trial_started_at`, `trial_ends_at`, `trial_status` only |
| Trial activation | Insert/update `company_subscriptions` | Update `companies` only |
| Subscription API | Trial from `company_subscriptions` | Paid from `company_subscriptions`; trial from `companies` (synthetic object) |
| Upgrade (trial → paid) | Already created subscription row | Same + set `trial_status = 'converted'` |
| Cancel trial | Update `company_subscriptions` status | Update `companies`; `/api/trial/cancel` added |
| Fix-missing-subscriptions | Created trial rows in `company_subscriptions` | Only fixes paid (active + razorpay_subscription_id); no trial rows |
