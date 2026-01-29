# PHASE-4: Legacy Quota Migration to Subscription-Based Quota

**Status: COMPLETED** (Jan 2025)

## Completed implementation summary

| Item | Status |
|------|--------|
| `/api/generate/hierarchy` | ✅ Auth via `verifyCompanyAccess(company_id)`; quota via `assertCompanyCanOperate`, `ensureActiveBillingUsage`, `checkUsageLimits` (UNIT + SSCC), `consumeQuotaBalance` / `refundQuotaBalance`; wallet removed. |
| `/api/admin/bulk-upload` | ✅ `requireAdmin()` at start; for pallet/carton, SSCC quota checked and consumed before create; loop creates records only (no wallet/`billing_transactions`); refund on catch. |
| `/api/billing/charge` | ✅ Legacy comment added in code; no behavior change. |

## Objective

Migrate generation-related flows that today use **wallet/credit** (`company_wallets`, `wallet_update_and_record`) to use **subscription-based quota** (`billing_usage`, `ensureActiveBillingUsage`, `consumeQuotaBalance` / `refundQuotaBalance`) so all generation is gated by plan limits and current-period usage.

## Problem Statement

Phase 3 aligned **user-facing** usage/limits to `billing_usage`. The following still used legacy wallet:

| Endpoint | Legacy behavior | Target |
|----------|-----------------|--------|
| `/api/generate/hierarchy` | Checks `company_wallets` balance + credit_limit; charges via `wallet_update_and_record` | Use `ensureActiveBillingUsage`, `checkUsageLimits`, `consumeQuotaBalance` for unit + SSCC; refund on failure |
| `/api/admin/bulk-upload` | Uses `company_wallets` and `getAndDecrementBalance`; logs to `billing_transactions` | Use subscription quota (SSCC/unit as per level); require admin |
| `/api/billing/charge` | Generic wallet charge API | **Document as legacy.** Generation callers must use quota-aware flows; this API remains for possible non-generation use or future deprecation. |

## Scope (in scope)

- **`/api/generate/hierarchy`**: Replace wallet check + charge/refund with quota check + consume/refund (unit + SSCC). Add company-access check for authenticated user.
- **`/api/admin/bulk-upload`**: Replace wallet decrement with subscription quota consume for the level (pallet/carton/box → SSCC). Add `requireAdmin()`. No change to label/code generation logic.
- **`/api/billing/charge`**: No code change; document as legacy in this doc and in code comments.

## Out of scope

- Changing how labels or SSCCs are generated (same RPCs and logic).
- Migrating other callers of `/api/billing/charge` (if any).
- Removing `company_wallets` or wallet RPCs from the codebase.

## Implementation

### 1. `/api/generate/hierarchy`

- **Auth**: Resolve user from session; ensure user has access to `company_id` (e.g. `verifyCompanyAccess(company_id)` or require `company_id` matches `getCurrentUserCompanyId()`).
- **Quota**:  
  - `assertCompanyCanOperate({ supabase, companyId })`  
  - `ensureActiveBillingUsage({ supabase, companyId })`  
  - Compute `total_strips` (units) and `totalBoxes + totalCartons + totalPallets` (SSCC).  
  - `checkUsageLimits(supabase, company_id, 'UNIT', total_strips)` and `checkUsageLimits(supabase, company_id, 'SSCC', ssccCount)`.  
  - `consumeQuotaBalance(company_id, 'unit', total_strips)` and `consumeQuotaBalance(company_id, 'sscc', ssccCount)`.
- **Generation**: Call `create_full_hierarchy` as today.
- **On failure**: `refundQuotaBalance(company_id, 'unit', total_strips)` and `refundQuotaBalance(company_id, 'sscc', ssccCount)`.
- **Done**: Wallet and `wallet_update_and_record` removed. Auth via `verifyCompanyAccess(company_id)`. Quota: `assertCompanyCanOperate`, `ensureActiveBillingUsage`, `checkUsageLimits` for UNIT and SSCC, `consumeQuotaBalance` for both; on failure `refundQuotaBalance` for both.

### 2. `/api/admin/bulk-upload`

- **Auth**: Add `requireAdmin()` at the start.
- **Quota**: Before the Prisma transaction: get `company_id` from body, use Supabase (e.g. `getSupabaseAdmin()`), `ensureActiveBillingUsage({ supabase, companyId })`, then for the requested `level` and row count `n`:
  - Pallet/carton/box → treat as SSCC; `checkUsageLimits(..., 'SSCC', n)` and `consumeQuotaBalance(company_id, 'sscc', n)`.
  - Unit → `checkUsageLimits(..., 'UNIT', n)` and `consumeQuotaBalance(company_id, 'unit', n)`.
- **Loop**: Keep creating pallets/cartons/boxes (or future unit) records; remove `getAndDecrementBalance` and wallet updates. Optionally keep `billing_transactions` as audit-only (no balance change) or remove; Phase 4 focuses on quota.
- **Done**: `requireAdmin()` at start. For level pallet/carton, before the Prisma transaction: `ensureActiveBillingUsage`, `checkUsageLimits(company_id, 'SSCC', rows.length)`, `consumeQuotaBalance(company_id, 'sscc', rows.length)`. Creation loop no longer uses wallet or `billing_transactions`; on catch, `refundQuotaBalance(company_id, 'sscc', rows.length)`.

### 3. `/api/billing/charge`

- **Doc only**: Add a short comment in the route and a note in this doc: “Legacy wallet charge API. Generation flows use subscription quota (see Phase 4). Use this only for non-generation charges or until fully deprecated.”

## Files touched

- `app/api/generate/hierarchy/route.ts` – switch from wallet to quota; add company-access check.
- `app/api/admin/bulk-upload/route.ts` – add `requireAdmin`, switch from wallet to quota consume/refund.
- `app/api/billing/charge/route.ts` – comment that it is legacy for generation.
- `docs/PHASE4_IMPLEMENTATION.md` – this document.

## Testing

1. **Hierarchy**: With a company that has sufficient unit and SSCC quota, call `/api/generate/hierarchy`; generation should succeed and quota should decrease. With insufficient quota, call should fail with 403 and no generation. On RPC failure, quota should be refunded.
2. **Bulk-upload**: As admin, upload pallets/cartons/boxes; SSCC quota should be consumed. Without admin, expect 403. Without quota, expect failure and no records.
3. **Billing/charge**: Unchanged; existing callers (if any) behave as before.

## Next steps (later phases)

- Decide whether to deprecate `/api/billing/charge` for generation entirely and move any remaining callers to quota-based flows.
- Optionally add audit logging (e.g. `logAdminAction`) for admin bulk-upload.
