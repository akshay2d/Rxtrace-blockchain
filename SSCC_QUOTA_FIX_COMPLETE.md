# SSCC Quota Fix - Complete

**Date**: January 23, 2026  
**Status**: ✅ **FIXED**

---

## Problem

SSCC quota was not being read from `quota_balances` table. The system was using `companies.sscc_quota_balance` column instead of the proper `quota_balances` table with `kind = 'sscc'`.

---

## Solution Implemented

### 1. Created `quota_balances` Table Migration
**File**: `supabase/migrations/20260129_fix_sscc_quota_from_quota_balances.sql`

- Creates `quota_balances` table with columns:
  - `company_id` (UUID, FK to companies)
  - `kind` (TEXT, CHECK: 'unit' | 'sscc')
  - `base_quota` (INTEGER)
  - `addon_quota` (INTEGER)
  - `used` (INTEGER)
  - Unique constraint: `(company_id, kind)`

- Migrates existing data from `companies` table to `quota_balances`

### 2. Created Atomic RPC Function for SSCC
**Function**: `consume_quota_and_insert_sscc_labels`

- Reads SSCC quota **ONLY** from `quota_balances` table (`kind = 'sscc'`)
- Calculates remaining quota: `base_quota + addon_quota - used`
- Blocks generation only if `remaining <= 0`
- Atomically consumes quota and inserts SSCC labels (boxes, cartons, pallets)
- Transaction rolls back if label insertion fails

### 3. Updated `consume_quota_balance` RPC
- For SSCC (`kind = 'sscc'`): Reads from `quota_balances` table
- For Unit (`kind = 'unit'`): Keeps existing logic (backward compatibility)
- Remaining quota calculation: `base_quota + addon_quota - used`
- Blocks only if `remaining <= 0`

### 4. Updated SSCC Generation Route
**File**: `app/api/sscc/generate/route.ts`

- Now uses atomic RPC `consume_quota_and_insert_sscc_labels`
- Matches unit quota logic (atomic transaction)
- Quota is consumed only if labels are successfully inserted
- No manual refund logic needed (handled by transaction rollback)

### 5. Added Quota Initialization
**Function**: `ensure_quota_balances`

- Initializes `quota_balances` rows for companies
- Reads quotas from `billing_usage` or uses plan defaults
- SSCC quota = `sscc_labels_quota` from billing_usage, or `pallet_labels_quota` as fallback

**Updated**: `app/api/trial/activate/route.ts`
- Initializes `quota_balances` after creating `billing_usage`
- Sets `sscc_labels_quota` in `billing_usage` (equals `pallet_labels_quota`)

---

## Rules Enforced

✅ **SSCC quota read ONLY from `quota_balances` (kind = 'sscc')**  
✅ **During trial: Uses `base_quota` from quota_balances**  
✅ **After trial: Follows active subscription plan's base quota**  
✅ **Remaining quota = `base_quota + addon_quota - used`**  
✅ **Block generation only if `remaining <= 0`**  
✅ **Do NOT read `companies.sscc_quota_balance`**  
✅ **No hardcoded quota values**  
✅ **No forced add-on purchase when quota exists**  
✅ **Behavior matches unit quota logic (atomic RPC)**

---

## Files Modified

1. `supabase/migrations/20260129_fix_sscc_quota_from_quota_balances.sql` (NEW)
   - Creates `quota_balances` table
   - Creates atomic RPC for SSCC
   - Updates `consume_quota_balance` RPC
   - Updates `refund_quota_balance` RPC
   - Creates `ensure_quota_balances` function

2. `app/api/sscc/generate/route.ts` (MODIFIED)
   - Uses atomic RPC `consume_quota_and_insert_sscc_labels`
   - Removed manual quota consumption and refund logic
   - Matches unit quota pattern

3. `app/api/trial/activate/route.ts` (MODIFIED)
   - Initializes `quota_balances` after trial activation
   - Sets `sscc_labels_quota` in `billing_usage`

---

## Next Steps

1. **Run Migration**: Execute `supabase/migrations/20260129_fix_sscc_quota_from_quota_balances.sql` in Supabase SQL Editor

2. **Verify**: 
   - Check that `quota_balances` table exists
   - Verify existing companies have quota_balances rows initialized
   - Test SSCC generation with trial user
   - Test SSCC generation with subscription user

3. **Test Scenarios**:
   - Trial user: Should use `base_quota` from quota_balances
   - Subscription user: Should use plan's `base_quota` from quota_balances
   - Quota exceeded: Should block generation with clear error
   - Add-on quota: Should allow generation when addon_quota exists

---

## Database Schema

```sql
quota_balances (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  kind TEXT NOT NULL CHECK (kind IN ('unit', 'sscc')),
  base_quota INTEGER NOT NULL DEFAULT 0,
  addon_quota INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE (company_id, kind)
)
```

---

## Quota Calculation

**Remaining SSCC Quota** = `base_quota + addon_quota - used`

**Block Condition**: `remaining <= 0`

**During Trial**: Uses `base_quota` from quota_balances (initialized from plan)

**After Trial**: Uses `base_quota` from quota_balances (updated from active subscription plan)

---

✅ **Fix Complete - Ready for Migration**
