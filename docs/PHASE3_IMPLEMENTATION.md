# PHASE-3: Quota Consolidation & User Dashboard Accuracy

**Status: COMPLETED** (Jan 2025)

## Objective

Establish a **single source of truth** for user-facing quota usage and limits so that the dashboard, billing page, and any other user UI show consistent "X of Y" numbers for the **current billing period**.

## Problem Statement

Today there are three storage locations for quota data:

| Table           | Purpose                         | Used by                                      |
|----------------|----------------------------------|----------------------------------------------|
| `billing_usage`| Current billing period usage & quotas | `ensureActiveBillingUsage`, dashboard stats |
| `plan_items`   | Plan-level limits (HARD/SOFT/NONE)    | `getUsageLimits`, admin, code enforcement |
| `usage_counters` | Calendar-month aggregates         | Analytics, previously `/api/user/usage`   |

`/api/dashboard/stats` returns usage from `billing_usage` but no limits. `/api/user/usage` returned usage from `usage_counters` and limits from `plan_items`, so "Usage & Limits" could show a different period and different usage numbers than the billing period. Phase 3 aligns **user-facing** usage and limits to **billing_usage** for the current period.

## Scope (in scope)

- **User-facing APIs**: `/api/user/usage`, `/api/dashboard/stats` (and any UI that shows "current period usage").
- **Single source for current period**: Use `billing_usage` (via `ensureActiveBillingUsage`) for both **usage** and **quota limits** in those APIs. `limit_type` (HARD/SOFT/NONE) continues to come from `plan_items` via `getUsageLimits`.
- **Dashboard & Billing UI**: Show "X of Y" using the consolidated response; no change to component contract, only to the data source behind `/api/user/usage`.

## Out of scope

- **Code generation enforcement** continues to use existing logic (`billing_usage` / `plan_items` as already implemented).
- **Analytics and admin reports** may keep using `usage_counters` for historical/calendar-month views.
- **Label/SSCC generation logic** is unchanged (no changes to unit labels or SSCC generation).

## Completed / In progress

### 1. Single source for user-facing usage and limits

- **Decision**: For "current billing period" usage and limits, use `billing_usage` as the source. Limits for display come from `billing_usage.*_quota`; `limit_type` from `plan_items` via `getUsageLimits`.
- **Implementation**:
  - Use `ensureActiveBillingUsage` in `/api/user/usage`. If an active row exists, derive usage and limits from it and merge with `getUsageLimits(admin, companyId)` for `limit_type`.
  - If there is no active billing row (e.g. no plan), keep existing fallback: `getCurrentUsage` + `getUsageLimits` (usage_counters + plan_items).

### 2. Dashboard and billing UI

- Dashboard "Usage & Limits" already consumes `/api/user/usage`. Once the API is backed by `billing_usage`, the UI shows billing-period-accurate "X of Y" without code changes.
- Billing page "Usage by Code Type" and quota rows: ensure they use the same logic (dashboard stats + plan items today); optional follow-up is to drive both from one endpoint that returns usage+limits from `billing_usage` for consistency.

### 3. Legacy quota references (document only)

- `VALIDATION_REPORT.md` and codebase note that `/api/billing/charge`, `/api/generate/hierarchy`, `/api/admin/bulk-upload` may still reference wallet/legacy quota. Phase 3 does not migrate those; they are documented as future tech-debt to move to subscription-based quota.

## API contract: `/api/user/usage`

**Response shape** (unchanged):

```json
{
  "success": true,
  "usage": {
    "UNIT":   { "used": 100, "limit_value": 5000, "limit_type": "HARD", "exceeded": false, "percentage": 2 },
    "BOX":    { "used": 10,  "limit_value": 200,  "limit_type": "HARD", "exceeded": false, "percentage": 5 },
    "CARTON": { "used": 5,   "limit_value": 100,  "limit_type": "SOFT", "exceeded": false, "percentage": 5 },
    "SSCC":   { "used": 15,  "limit_value": 300,  "limit_type": "HARD", "exceeded": false, "percentage": 5 }
  }
}
```

- **used** / **limit_value**: From `billing_usage` when an active row exists; otherwise from `getCurrentUsage` + `getUsageLimits`.
- **limit_type**: From `plan_items` via `getUsageLimits` (same as today).

## Files touched

- **`lib/billing/usage.ts`** – `billingUsageToDashboard(row, limits)`, `BillingUsageMetric`, `BillingUsageDashboard` (PHASE-3).
- **`app/api/user/usage/route.ts`** – uses `ensureActiveBillingUsage` + `billingUsageToDashboard` when active; else `getCurrentUsage` + `getUsageLimits`.
- **`app/api/dashboard/stats/route.ts`** – already uses `ensureActiveBillingUsage` for `label_generation` (no change required).
- **`docs/PHASE3_IMPLEMENTATION.md`** – this document.

## Testing

1. **With active subscription**: Call `/api/user/usage`; used and limit_value should match the active `billing_usage` row for that company.
2. **Dashboard**: "Usage & Limits" should show the same numbers as the billing period (e.g. after generating labels, both dashboard and billing context should reflect it).
3. **No plan / trial ended**: API should fall back to existing behaviour (no regression).

## Next steps (later phases)

- Migrate legacy quota references in `/api/billing/charge`, `/api/generate/hierarchy`, `/api/admin/bulk-upload` to subscription-based quota (separate task).
- Optional: drive billing page "Usage & Quotas" from `/api/user/usage` only so one endpoint serves both usage and limits everywhere.
