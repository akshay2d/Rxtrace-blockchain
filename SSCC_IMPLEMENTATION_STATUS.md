# SSCC Hierarchy & Quota Implementation Status

## ✅ COMPLETED

### Part A: Hierarchical SSCC Level Selection UI
- ✅ Added checkboxes for Box, Carton, Pallet in `app/dashboard/code-generation/sscc/page.tsx`
- ✅ Auto-selection logic implemented:
  - Selecting Carton → auto-selects Box
  - Selecting Pallet → auto-selects Box + Carton
  - Unselecting Box → unselects Carton & Pallet
  - Unselecting Carton → unselects Pallet
- ✅ Frontend validation for hierarchy rules
- ✅ Helper text explaining hierarchy requirement
- ✅ Updated form state to include `generateBox`, `generateCarton`, `generatePallet`

### Part B: Unified SSCC Generation API
- ✅ Created `/app/api/sscc/generate/route.ts` unified endpoint
- ✅ Backend hierarchy validation
- ✅ Calculates total SSCC count across all selected levels
- ✅ Generates SSCCs for Box, Carton, and Pallet based on selection
- ✅ Returns consolidated response with all levels

## ⏳ IN PROGRESS / TODO

### Part C: Quota Model Implementation

#### 1. Database Schema Updates (REQUIRED)
**Current State:**
- `billing_usage` table has separate quotas: `box_labels_quota`, `carton_labels_quota`, `pallet_labels_quota`
- `companies` table does NOT have quota balance tracking fields

**Required Changes:**
```sql
-- Add to companies table
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS unit_quota_balance INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sscc_quota_balance INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_quota_rollover_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS add_on_unit_balance INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS add_on_sscc_balance INTEGER DEFAULT 0;

-- Update billing_usage to add consolidated SSCC quota
ALTER TABLE billing_usage
  ADD COLUMN IF NOT EXISTS sscc_labels_quota INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sscc_labels_used INTEGER DEFAULT 0;
```

#### 2. Quota Rollover Logic (REQUIRED)
**File to Create:** `lib/billing/quota.ts`

**Function:** `applyQuotaRollover(companyId, now)`

**Logic:**
1. Check if plan is yearly (`subscription_plan` contains 'annual' or 'yearly')
2. If yearly:
   - Calculate months elapsed since `last_quota_rollover_at`
   - For each elapsed month:
     - `unit_quota_balance += unit_quota_per_month`
     - `sscc_quota_balance += sscc_quota_per_month`
   - Update `last_quota_rollover_at` to current month start
3. If monthly: No rollover (quota resets each month)

**Integration Points:**
- Call `applyQuotaRollover()` BEFORE quota validation in:
  - `/api/issues/route.ts` (unit generation)
  - `/api/sscc/generate/route.ts` (SSCC generation)

#### 3. Consolidated SSCC Quota Enforcement (REQUIRED)
**Current:** Separate quotas for box/carton/pallet
**Required:** Single `sscc_quota_balance` consumed by all levels

**Changes Needed:**
1. Update `billing_usage_consume` RPC to support 'sscc' kind
2. Update `/api/sscc/generate/route.ts` to:
   - Call `applyQuotaRollover()` before quota check
   - Check: `totalSSCCCount <= (sscc_quota_balance + add_on_sscc_balance)`
   - Deduct from `sscc_quota_balance` first, then `add_on_sscc_balance`
3. Update `/api/issues/route.ts` to:
   - Call `applyQuotaRollover()` before quota check
   - Use `unit_quota_balance` instead of `billing_usage_consume` RPC

#### 4. Database Table Updates (REQUIRED)
**Check if tables have required columns:**
- `boxes` table: `sscc_level`, `parent_sscc`
- `cartons` table: `sscc_level`, `parent_sscc`
- `pallets` table: `sscc_level`, `parent_sscc`

**If missing, add:**
```sql
ALTER TABLE boxes
  ADD COLUMN IF NOT EXISTS sscc_level TEXT CHECK (sscc_level IN ('box', 'carton', 'pallet')),
  ADD COLUMN IF NOT EXISTS parent_sscc TEXT;

ALTER TABLE cartons
  ADD COLUMN IF NOT EXISTS sscc_level TEXT CHECK (sscc_level IN ('box', 'carton', 'pallet')),
  ADD COLUMN IF NOT EXISTS parent_sscc TEXT;

ALTER TABLE pallets
  ADD COLUMN IF NOT EXISTS sscc_level TEXT CHECK (sscc_level IN ('box', 'carton', 'pallet')),
  ADD COLUMN IF NOT EXISTS parent_sscc TEXT;
```

## 🔧 IMPLEMENTATION NOTES

### Current API Endpoint Behavior
The new `/api/sscc/generate` endpoint:
- ✅ Validates hierarchy rules
- ✅ Generates SSCCs for all selected levels
- ⚠️ Currently uses `billing_usage_consume` with 'pallet' kind (temporary)
- ⚠️ Does NOT implement rollover yet
- ⚠️ Does NOT use consolidated SSCC quota yet

### Migration Path
1. **Phase 1:** Add database columns (non-breaking)
2. **Phase 2:** Implement rollover logic helper
3. **Phase 3:** Update quota enforcement to use balance fields
4. **Phase 4:** Migrate existing quota to balance fields
5. **Phase 5:** Update RPC functions to support 'sscc' kind

## 📋 TESTING CHECKLIST

### Hierarchy Validation
- [ ] Select only Box → generates boxes only
- [ ] Select Box + Carton → generates boxes and cartons
- [ ] Select Box + Carton + Pallet → generates all three levels
- [ ] Try to select Carton without Box → blocked with error
- [ ] Try to select Pallet without Box/Carton → blocked with error

### Quota Enforcement
- [ ] Generate SSCCs up to quota limit → succeeds
- [ ] Generate SSCCs exceeding quota → blocked with error
- [ ] Yearly plan: unused quota accumulates month-to-month
- [ ] Monthly plan: quota resets each month
- [ ] Add-ons increase available quota

### Quota Calculation
- [ ] Box only: 1 SSCC per box
- [ ] Box + Carton: SSCCs for both levels
- [ ] Box + Carton + Pallet: SSCCs for all three levels
- [ ] Total quota consumed = sum of all SSCCs generated

## ⚠️ CRITICAL NOTES

1. **Database Schema:** Must verify table structures before deploying
2. **Quota Migration:** Existing quota data needs migration to balance fields
3. **Backward Compatibility:** Old endpoints (`/api/box/create`, `/api/carton/create`, `/api/pallet/create`) still exist
4. **Rollover Logic:** Must be idempotent and safe for concurrent requests

## 🚀 NEXT STEPS

1. Review database schema and add missing columns
2. Implement `lib/billing/quota.ts` rollover helper
3. Update quota enforcement in generation APIs
4. Test hierarchy validation end-to-end
5. Test quota rollover with yearly plans
6. Migrate existing quota data
