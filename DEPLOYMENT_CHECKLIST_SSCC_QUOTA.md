# SSCC Hierarchy & Quota - Deployment Checklist

## ✅ Implementation Complete

All code changes are complete. This checklist ensures safe deployment.

## 🔍 Pre-Deployment Verification

### 1. Database Schema Check
- [ ] Verify `companies` table has columns:
  - `unit_quota_balance`
  - `sscc_quota_balance`
  - `last_quota_rollover_at`
  - `add_on_unit_balance`
  - `add_on_sscc_balance`

- [ ] Verify `billing_usage` table has columns:
  - `sscc_labels_quota`
  - `sscc_labels_used`

- [ ] Verify `boxes`, `cartons`, `pallets` tables have columns:
  - `sscc_level`
  - `parent_sscc`

### 2. Database Functions Check
- [ ] Verify function exists: `apply_quota_rollover`
- [ ] Verify function exists: `consume_quota_balance`
- [ ] Verify function exists: `refund_quota_balance`

### 3. Code Files Check
- [ ] `app/dashboard/code-generation/sscc/page.tsx` - UI with checkboxes
- [ ] `app/api/sscc/generate/route.ts` - Unified SSCC endpoint
- [ ] `lib/billing/quota.ts` - Quota rollover logic
- [ ] `app/api/issues/route.ts` - Updated unit quota
- [ ] `lib/billing/usage.ts` - SSCC quota support
- [ ] `lib/billing/period.ts` - SSCC quota calculation

## 📋 Deployment Steps

### Step 1: Database Migration
```sql
-- Run in Supabase SQL Editor
-- File: supabase/migrations/20260125_quota_balance_rollover.sql
-- File: supabase/migrations/20260125_initialize_quota_balances.sql
```

**Verification:**
```sql
-- Check columns exist
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'companies' 
AND column_name IN ('unit_quota_balance', 'sscc_quota_balance', 'last_quota_rollover_at');

-- Check functions exist
SELECT routine_name FROM information_schema.routines 
WHERE routine_name IN ('apply_quota_rollover', 'consume_quota_balance', 'refund_quota_balance');
```

### Step 2: Deploy Code
- Deploy all modified files to production
- Ensure environment variables are set
- Run `npm run build` to verify no TypeScript errors

### Step 3: Initialize Quota Balances
- Run migration: `20260125_initialize_quota_balances.sql`
- This sets initial balances for existing companies
- For new companies, balances initialize to 0

### Step 4: Test Hierarchy Validation
1. Navigate to `/dashboard/code-generation/sscc`
2. Try selecting Carton without Box → Should show error
3. Try selecting Pallet without Box/Carton → Should show error
4. Select Box only → Should work
5. Select Box + Carton → Should work
6. Select Box + Carton + Pallet → Should work

### Step 5: Test Quota Enforcement
1. Generate SSCCs up to quota limit → Should succeed
2. Generate SSCCs exceeding quota → Should show error
3. Verify quota is consumed correctly

### Step 6: Test Rollover (Yearly Plans)
1. Create test company with yearly plan
2. Set `last_quota_rollover_at` to 2 months ago
3. Generate codes → Should accumulate quota
4. Verify `unit_quota_balance` and `sscc_quota_balance` increased

## ⚠️ Rollback Plan

If issues occur:

1. **Revert Code Changes**
   - Revert API routes to use old quota system
   - Keep database migrations (non-breaking)

2. **Database Rollback** (if needed)
   ```sql
   -- Remove new columns (only if critical issue)
   ALTER TABLE companies DROP COLUMN IF EXISTS unit_quota_balance;
   ALTER TABLE companies DROP COLUMN IF EXISTS sscc_quota_balance;
   -- etc.
   ```

3. **Function Rollback**
   ```sql
   DROP FUNCTION IF EXISTS apply_quota_rollover;
   DROP FUNCTION IF EXISTS consume_quota_balance;
   DROP FUNCTION IF EXISTS refund_quota_balance;
   ```

## 📊 Monitoring

After deployment, monitor:
- SSCC generation success rate
- Quota consumption accuracy
- Rollover calculations (yearly plans)
- Error rates in quota enforcement

## 🔗 Related Files

- `SSCC_HIERARCHY_QUOTA_IMPLEMENTATION.md` - Implementation plan
- `SSCC_IMPLEMENTATION_STATUS.md` - Status tracking
- `SSCC_QUOTA_IMPLEMENTATION_COMPLETE.md` - Complete documentation
