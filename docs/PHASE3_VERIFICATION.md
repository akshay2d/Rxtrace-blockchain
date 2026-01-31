# Phase 3: Billing Cycle — Verification (Not New Development)

**Date:** January 2026  
**Action:** Verification of existing implementation against the plan.

---

## What was done

Phase 3 development was **already implemented**. This document records **verification** of that implementation (no new code was written in this step).

---

## Plan vs code

| Plan requirement | Where implemented | Verified |
|------------------|-------------------|----------|
| **3.1 Frontend: send billing cycle with plan** | `app/pricing/page.tsx` | ✅ |
| **3.2 Upgrade API: accept billing_cycle, use correct plan_id** | `app/api/billing/subscription/upgrade/route.ts` | ✅ |
| **3.3 Billing cycle in Razorpay notes** | Same route, `notes.billing_cycle` | ✅ |
| **3.4 Billing cycle in invoices** | `app/api/razorpay/webhook/route.ts` → `billing_cycle` on invoice | ✅ |

---

## Verification details

### 1. Pricing page (`app/pricing/page.tsx`)

- **State:** `selectedBillingCycle` (`'monthly' \| 'yearly'`) — line 169.
- **UI:** Monthly/Annual toggle — lines 824, 835.
- **Subscribe:** `subscribeToPlan()` sends `billing_cycle: billingCycle` (from `plan.billing_cycle`) — lines 449–460.
- **Preview:** `calculate-amount` is called with `billing_cycle: cycle` (from `selectedBillingCycle`) — lines 259, 271.
- **Plans:** Plans grouped by `billing_cycle` (monthly/yearly); correct plan shown per selected cycle — lines 864–865, 871.

### 2. Upgrade API (`app/api/billing/subscription/upgrade/route.ts`)

- **Input:** Reads `body.billing_cycle` / `body.billing_cycle_raw` — lines 31–32.
- **Normalize:** `normalizeCycleForDb(billingCycleRaw)` → `'monthly' \| 'yearly'` — line 32.
- **Plan ID:** `razorpaySubscriptionPlanIdFor(requestedPlan, billingCycleRaw)` — line 36 (cycle-specific Razorpay plan).
- **DB plan:** Fetches plan from `subscription_plans` by `name` + `billing_cycle` — lines 60–66.
- **Razorpay notes:** `billing_cycle: billingCycleDb` on create and update — lines 177, 208.
- **Companies:** Updates `subscription_plan`, `razorpay_plan_id`, etc. (cycle is implied by `razorpay_plan_id`).

### 3. Razorpay helper (`lib/razorpay/server.ts`)

- **Signature:** `razorpaySubscriptionPlanIdFor(planRaw, cycleRaw?)` — line 72.
- **Behaviour:** Uses `cycleRaw` to pick monthly vs yearly env var and returns correct Razorpay plan ID.

### 4. Invoices

- **Webhook:** Reads `billing_cycle` from subscription notes and writes to `billing_invoices.billing_cycle` — webhook route lines 866–867, 934.
- **PDF:** Invoice PDF shows billing cycle — `lib/billing/invoicePdf.tsx` lines 72, 125–128.

---

## Success criteria (from plan)

- [x] Monthly selection → monthly `plan_id` (via `razorpaySubscriptionPlanIdFor(..., 'monthly')`).
- [x] Annual selection → annual `plan_id` (via `razorpaySubscriptionPlanIdFor(..., 'yearly')`).
- [x] Billing cycle in Razorpay subscription notes.
- [x] Billing cycle stored in invoices (webhook + schema).

---

## Conclusion

Phase 3 is **complete**. All development was already in place; this was a **verification** step only. No code changes were made for Phase 3 in this pass.
