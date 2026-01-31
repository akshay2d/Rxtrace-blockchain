# Subscription & Trial Fix — Updated Summary

## Objective
Trial does not depend on subscription plan. Trial and paid subscription both work in production.

---

## 1. Schema (Migration)

**File:** `supabase/migrations/20260225_trial_plan_null_is_trial.sql`

| Change | Description |
|--------|-------------|
| **plan_id** | If column **missing**: add as nullable `UUID REFERENCES subscription_plans(id)`. If **present**: make nullable (`DROP NOT NULL`). |
| **is_trial** | Add column if missing: `is_trial BOOLEAN NOT NULL DEFAULT false`. |
| **status** | **If `status` is enum `subscription_status`:** add enum value `'trialing'` if not present (no CHECK). **If `status` is TEXT:** drop existing CHECK and add CHECK allowing `'TRIAL'`, `'trialing'`, `'ACTIVE'`, `'PAUSED'`, `'CANCELLED'`, `'EXPIRED'`. |

Handles:
- DBs where `company_subscriptions` has no `plan_id`.
- DBs where `status` is an enum (avoids "invalid input value for enum subscription_status: 'TRIAL'").

---

## 2. Trial Endpoint

**File:** `app/api/trial/activate/route.ts`

- **Does not:** resolve plan, call billing provider, or require `plan_id`.
- **Creates** `company_subscriptions` row with:
  - `plan_id` = NULL  
  - `status` = `'trialing'`  
  - `is_trial` = true  
  - `trial_end` = now + 15 days  
- **Already activated:** treats both `TRIAL` and `trialing` as existing trial.
- **After insert:** sets `companies.subscription_status = 'trial'` so middleware allows access.

---

## 3. Subscription Validation (Frontend)

**File:** `lib/hooks/useSubscription.tsx`

- **Types:** `plan_id` and `plan` nullable; `SubscriptionStatus` includes `'trialing'`; optional `is_trial`.
- **Access:** `canAccess()` and `isFeatureEnabled()` treat `'TRIAL'` and `'trialing'` as valid; no plan required for trial.

---

## 4. Subscription API & Display

- **`app/api/user/subscription/route.ts`** — Returns `plan_id ?? null`, `is_trial` (from DB or derived from status).
- **`app/api/billing/subscription/cancel/route.ts`** — Trial cancel applies when status is `TRIAL` or `trialing`.
- **`components/subscription/SubscriptionBanner.tsx`** — Treats `TRIAL` and `trialing` as trial for “expiring soon” banner.
- **`app/dashboard/billing/page.tsx`** — All trial UI checks use `TRIAL` or `trialing`.
- **`app/dashboard/settings/page.tsx`** — Trial status, “Trial Active”, and trial CTA use `TRIAL` or `trialing`.

---

## 5. Trial CTA (No plan_id)

- **`app/pricing/page.tsx`** — Trial button calls `/api/trial/activate` with body `{ company_id }` only (no `plan` / `plan_id`).
- **Settings** — “Start 15-Day Free Trial” already calls the same endpoint with `company_id` and `user_id` only.

---

## 6. Admin & Fix Script

- **`app/api/admin/fix-missing-subscriptions/route.ts`** — Creates trial rows with `plan_id` = NULL, `status` = `'trialing'`, `is_trial` = true (no starter plan).

---

## 7. Paid Flow (Unchanged)

- Paid subscriptions still require `plan_id` and use the billing provider.
- No change to upgrade/cancel/resume for paid plans except cancel accepts `trialing` as trial.

---

## Verification

See **SUBSCRIPTION_TRIAL_VERIFICATION.md**.

1. **Trial:** New user → start trial → row has `plan_id` NULL, `is_trial` true, `status` `trialing` → user can access app.
2. **Paid:** Subscribe to paid plan → row has `plan_id` set, `status` `ACTIVE`.

If either fails, the fix is not complete.
