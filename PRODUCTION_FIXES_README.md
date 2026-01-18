# PRODUCTION FIXES - COMPLETE MIGRATION GUIDE

## Overview

This migration fixes all critical issues identified in the Project Structure Audit:
1. ✅ **Type Mismatch Fix** - Converts `user_id` columns from UUID to TEXT
2. ✅ **Missing Columns** - Ensures all required columns exist
3. ✅ **Missing Constraints** - Adds uniqueness, foreign keys, and check constraints
4. ✅ **Missing Indexes** - Creates all required indexes for performance
5. ✅ **RLS Policies** - Creates type-safe Row Level Security policies

## Files

1. **`PRODUCTION_FIXES_COMPLETE.sql`** - Main migration script (run this first)
2. **`VERIFY_PRODUCTION_FIXES.sql`** - Verification script (run after migration)
3. **`PRODUCTION_FIXES_README.md`** - This file

## How to Run

### Step 1: Run the Main Migration

1. Open **Supabase SQL Editor**
2. Copy the entire contents of `PRODUCTION_FIXES_COMPLETE.sql`
3. Paste into the SQL Editor
4. Click **Run** (or press `Ctrl+Enter`)

**Expected Output:**
- Multiple `NOTICE` messages about type conversions
- No errors (if errors occur, see Troubleshooting below)

**Time:** ~30-60 seconds depending on database size

### Step 2: Verify the Migration

1. In the same SQL Editor, clear the previous query
2. Copy the entire contents of `VERIFY_PRODUCTION_FIXES.sql`
3. Paste and run

**Expected Output:**
- Multiple test result tables showing ✅ PASS for all critical tests
- Summary report at the end

### Step 3: Manual RLS Testing (Optional but Recommended)

1. Authenticate as a test user in your application
2. Run the manual test queries at the bottom of `VERIFY_PRODUCTION_FIXES.sql`
3. Verify you can only see your own company's data

## What Gets Fixed

### 1. Type Mismatch Fix

**Problem:** `user_id` columns were UUID, but code expects TEXT to match `auth.uid()::text`

**Fix:**
- Converts `companies.user_id` from UUID → TEXT
- Converts `seats.user_id` from UUID → TEXT
- Converts `user_profiles.id` from UUID → TEXT (if needed)
- All RLS policies use `user_id::text = auth.uid()::text`

### 2. Missing Columns

**Added to `companies` table:**
- `contact_person_name`, `firm_type`, `business_category`, `business_type`
- `subscription_status`, `subscription_plan`, `trial_start_date`, `trial_end_date`
- `pan`, `gst`, `phone`, `address`, `email`
- `extra_user_seats`, `extra_erp_integrations`
- Razorpay columns: `razorpay_customer_id`, `razorpay_subscription_id`, etc.

**Added to `labels_units` table:**
- `gs1_payload TEXT NOT NULL` - ⭐ CRITICAL for scan validation

### 3. Missing Constraints

**Uniqueness Constraints:**
- `companies.user_id` - One company per user
- `companies.company_name` (case-insensitive) - Prevent duplicates
- `labels_units(company_id, gtin, batch, serial)` - ⭐ CRITICAL for GS1 compliance
- `seats(company_id, email)` - One active seat per email per company
- `billing_usage(company_id, billing_period_start)` - One usage record per period

**Foreign Key Constraints:**
- All `company_id` columns reference `companies(id) ON DELETE CASCADE`
- Cross-references: `boxes.carton_id`, `boxes.pallet_id`, `cartons.pallet_id`, `labels_units.box_id`

**Check Constraints:**
- `companies.firm_type` - Valid enum values
- `companies.business_category` - Valid enum values
- `companies.business_type` - Valid enum values
- `companies.subscription_status` - Valid enum values
- `seats.role` - Valid enum values
- `seats.status` - Valid enum values

### 4. Missing Indexes

**Critical Indexes Added:**
- `idx_companies_user_id` - Fast user → company lookup
- `idx_companies_subscription_status` - Filter by subscription
- `idx_seats_company_id`, `idx_seats_user_id` - Fast seat lookups
- `idx_labels_units_company_serial` - Fast serial lookups
- `idx_labels_units_company_gtin_batch` - Fast batch lookups
- Indexes on all foreign keys

### 5. RLS Policies

**Policies Created:**
- **Companies:** Users can view/update own company
- **Seats:** Users can view own seat + company seats
- **Labels Units:** Users can view/insert own company units
- **Boxes/Cartons/Pallets:** Users can view/manage own company containers
- **Supporting Tables:** Scan logs, audit logs, wallets, billing, etc.
- **Service Role:** Full access for all tables (backend API)

**All policies use type-safe comparisons:**
```sql
user_id::text = auth.uid()::text
```

## Tables Created/Modified

### Core Tables
- ✅ `companies` - Company profiles
- ✅ `seats` - Team/user management
- ✅ `labels_units` - Unit labels (GS1 codes)
- ✅ `boxes` - Box containers
- ✅ `cartons` - Carton containers
- ✅ `pallets` - Pallet containers
- ✅ `skus` - SKU master

### Supporting Tables
- ✅ `user_profiles` - User profile data
- ✅ `otp_verifications` - OTP verification
- ✅ `billing_usage` - Usage tracking
- ✅ `scan_logs` - Scan history
- ✅ `audit_logs` - Audit trail
- ✅ `company_wallets` - Wallet balances
- ✅ `company_active_heads` - Paid modules
- ✅ `billing_transactions` - Transaction history

## Troubleshooting

### Error: "cannot alter type of a column used in a policy definition"

**Solution:** The migration drops all policies first, then converts types. If this error occurs:
1. Manually drop the policy mentioned in the error
2. Re-run the migration

### Error: "column already exists"

**Solution:** This is expected - the migration uses `ADD COLUMN IF NOT EXISTS`. The error is harmless.

### Error: "constraint already exists"

**Solution:** This is expected - the migration checks for existence before creating. The error is harmless.

### RLS Policies Not Working

**Check:**
1. Verify RLS is enabled: `SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'companies';`
2. Verify policies exist: `SELECT * FROM pg_policies WHERE tablename = 'companies';`
3. Test with authenticated user: Run manual test queries in verification script

### Type Mismatch Still Occurring

**Check:**
```sql
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('companies', 'seats') 
AND column_name = 'user_id';
```

**Should show:** `data_type = 'text'`

If not, manually convert:
```sql
ALTER TABLE companies ALTER COLUMN user_id TYPE TEXT USING user_id::text;
ALTER TABLE seats ALTER COLUMN user_id TYPE TEXT USING user_id::text;
```

## Rollback (If Needed)

**⚠️ WARNING:** This migration modifies data types and adds constraints. Rollback is complex.

**If you need to rollback:**
1. Drop all RLS policies
2. Drop all constraints
3. Convert `user_id` columns back to UUID (if needed)
4. Restore from backup (recommended)

**Better approach:** Test in a staging environment first.

## Verification Checklist

After running the migration, verify:

- [ ] `companies.user_id` is TEXT type
- [ ] `seats.user_id` is TEXT type
- [ ] `labels_units.gs1_payload` column exists
- [ ] Uniqueness constraint on `labels_units(company_id, gtin, batch, serial)` exists
- [ ] RLS is enabled on all tables
- [ ] RLS policies exist for all tables
- [ ] Foreign key constraints exist
- [ ] Indexes exist on critical columns
- [ ] Manual RLS test passes (can only see own data)

## Next Steps

After successful migration:

1. **Test Authentication Flow:**
   - Sign up new user
   - Verify company creation works
   - Verify seat auto-creation works

2. **Test GS1 Generation:**
   - Generate unit labels
   - Verify `gs1_payload` is populated
   - Verify uniqueness constraint prevents duplicates

3. **Test Scanning:**
   - Scan a unit label
   - Verify payload validation works
   - Verify scan logs are created

4. **Test RLS:**
   - Create two test companies
   - Verify users can only see their own data
   - Verify service role can see all data

## Support

If you encounter issues:
1. Check the verification script output
2. Review error messages carefully
3. Check Supabase logs for detailed errors
4. Verify all prerequisites are met

---

**Migration Status:** ✅ Ready for Production  
**Last Updated:** 2025-01-20  
**Tested On:** Supabase PostgreSQL 15+
