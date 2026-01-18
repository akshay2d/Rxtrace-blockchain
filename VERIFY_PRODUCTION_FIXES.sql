-- =====================================================
-- VERIFICATION SCRIPT - PRODUCTION FIXES
-- Run this AFTER PRODUCTION_FIXES_COMPLETE.sql
-- Verifies: Type Mismatch Fix, Columns, Constraints, Indexes, RLS
-- =====================================================

-- =====================================================
-- TEST 1: Verify Type Mismatch Fix (user_id columns are TEXT)
-- =====================================================
SELECT 
  'TEST 1: Type Mismatch Fix' as test_name,
  table_name,
  column_name,
  data_type,
  CASE 
    WHEN data_type = 'text' THEN '✅ PASS'
    WHEN data_type = 'uuid' THEN '❌ FAIL - Still UUID'
    ELSE '⚠️ WARNING - Unexpected type'
  END as status
FROM information_schema.columns 
WHERE table_schema = 'public'
AND (
  (table_name = 'companies' AND column_name = 'user_id')
  OR (table_name = 'seats' AND column_name = 'user_id')
  OR (table_name = 'user_profiles' AND column_name = 'id')
)
ORDER BY table_name, column_name;

-- =====================================================
-- TEST 2: Verify Required Columns Exist on companies
-- =====================================================
SELECT 
  'TEST 2: Companies Table Columns' as test_name,
  column_name,
  data_type,
  is_nullable,
  CASE 
    WHEN column_name IN (
      'id', 'user_id', 'company_name', 'contact_person_name', 'firm_type',
      'business_category', 'business_type', 'subscription_status', 'subscription_plan',
      'trial_start_date', 'trial_end_date', 'pan', 'gst', 'phone', 'address', 'email',
      'extra_user_seats', 'extra_erp_integrations', 'created_at'
    ) THEN '✅ Required'
    ELSE 'ℹ️ Optional'
  END as required_status
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'companies'
ORDER BY ordinal_position;

-- =====================================================
-- TEST 3: Verify Uniqueness Constraint on labels_units
-- =====================================================
SELECT 
  'TEST 3: Uniqueness Constraint' as test_name,
  conname as constraint_name,
  contype as constraint_type,
  CASE 
    WHEN conname = 'labels_units_unique_company_gtin_batch_serial' THEN '✅ PASS'
    ELSE '⚠️ Different constraint name'
  END as status
FROM pg_constraint 
WHERE conrelid = 'public.labels_units'::regclass
AND contype = 'u'
AND conname LIKE '%unique%';

-- =====================================================
-- TEST 4: Verify gs1_payload Column Exists
-- =====================================================
SELECT 
  'TEST 4: GS1 Payload Column' as test_name,
  column_name,
  data_type,
  is_nullable,
  CASE 
    WHEN column_name = 'gs1_payload' AND data_type = 'text' AND is_nullable = 'NO' THEN '✅ PASS'
    WHEN column_name = 'gs1_payload' AND is_nullable = 'YES' THEN '⚠️ WARNING - Should be NOT NULL'
    WHEN column_name = 'gs1_payload' THEN '⚠️ WARNING - Wrong data type'
    ELSE '❌ FAIL - Column missing'
  END as status
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'labels_units'
AND column_name = 'gs1_payload';

-- =====================================================
-- TEST 5: Verify RLS is Enabled on All Tables
-- =====================================================
SELECT 
  'TEST 5: RLS Enabled' as test_name,
  tablename,
  rowsecurity as rls_enabled,
  CASE 
    WHEN rowsecurity = true THEN '✅ PASS'
    ELSE '❌ FAIL - RLS not enabled'
  END as status
FROM pg_tables 
WHERE schemaname = 'public'
AND tablename IN (
  'companies', 'seats', 'labels_units', 'boxes', 'cartons', 'pallets',
  'skus', 'scan_logs', 'audit_logs', 'company_wallets', 'company_active_heads',
  'billing_transactions', 'user_profiles', 'billing_usage'
)
ORDER BY tablename;

-- =====================================================
-- TEST 6: Verify RLS Policies Exist (Count)
-- =====================================================
SELECT 
  'TEST 6: RLS Policies Count' as test_name,
  tablename,
  COUNT(*) as policy_count,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ PASS'
    ELSE '❌ FAIL - No policies'
  END as status
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN (
  'companies', 'seats', 'labels_units', 'boxes', 'cartons', 'pallets',
  'skus', 'scan_logs', 'audit_logs', 'company_wallets', 'company_active_heads',
  'billing_transactions', 'user_profiles', 'billing_usage'
)
GROUP BY tablename
ORDER BY tablename;

-- =====================================================
-- TEST 7: Verify Foreign Key Constraints
-- =====================================================
SELECT 
  'TEST 7: Foreign Key Constraints' as test_name,
  conname as constraint_name,
  conrelid::regclass::text as table_name,
  confrelid::regclass::text as referenced_table,
  CASE 
    WHEN conname IS NOT NULL THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as status
FROM pg_constraint
WHERE contype = 'f'
AND conrelid::regclass::text IN (
  'seats', 'labels_units', 'boxes', 'cartons', 'pallets',
  'skus', 'scan_logs', 'audit_logs', 'company_wallets', 'company_active_heads',
  'billing_transactions', 'billing_usage'
)
AND conname LIKE '%company_id%fkey'
ORDER BY conrelid::regclass::text;

-- =====================================================
-- TEST 8: Verify Critical Indexes Exist
-- =====================================================
SELECT 
  'TEST 8: Critical Indexes' as test_name,
  tablename,
  indexname,
  CASE 
    WHEN indexname LIKE 'idx_%' OR indexname LIKE '%_unique' THEN '✅ PASS'
    ELSE 'ℹ️ System index'
  END as status
FROM pg_indexes
WHERE schemaname = 'public'
AND (
  (tablename = 'companies' AND indexname IN ('idx_companies_user_id', 'idx_companies_subscription_status'))
  OR (tablename = 'seats' AND indexname IN ('idx_seats_company_id', 'idx_seats_user_id'))
  OR (tablename = 'labels_units' AND indexname IN ('idx_labels_units_company_serial', 'labels_units_unique_company_gtin_batch_serial'))
)
ORDER BY tablename, indexname;

-- =====================================================
-- TEST 9: Verify Check Constraints on companies
-- =====================================================
SELECT 
  'TEST 9: Check Constraints' as test_name,
  conname as constraint_name,
  CASE 
    WHEN conname LIKE '%firm_type%' OR conname LIKE '%business_category%' OR conname LIKE '%business_type%' OR conname LIKE '%subscription_status%' THEN '✅ PASS'
    ELSE 'ℹ️ Other constraint'
  END as status
FROM pg_constraint
WHERE conrelid = 'public.companies'::regclass
AND contype = 'c'
ORDER BY conname;

-- =====================================================
-- TEST 10: Verify RLS Policy Syntax (Type Casting)
-- =====================================================
SELECT 
  'TEST 10: RLS Policy Type Casting' as test_name,
  tablename,
  policyname,
  CASE 
    WHEN qual::text LIKE '%::text%' OR with_check::text LIKE '%::text%' THEN '✅ PASS - Uses type casting'
    WHEN qual::text LIKE '%auth.uid()%' OR with_check::text LIKE '%auth.uid()%' THEN '⚠️ WARNING - May need type casting'
    ELSE 'ℹ️ No auth.uid() in policy'
  END as status
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('companies', 'seats', 'labels_units')
AND (qual::text LIKE '%auth.uid()%' OR with_check::text LIKE '%auth.uid()%')
ORDER BY tablename, policyname;

-- =====================================================
-- SUMMARY REPORT
-- =====================================================
SELECT 
  'SUMMARY' as report_section,
  COUNT(DISTINCT CASE WHEN data_type = 'text' THEN table_name END) as text_user_id_tables,
  COUNT(DISTINCT CASE WHEN data_type = 'uuid' THEN table_name END) as uuid_user_id_tables,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'labels_units_unique_company_gtin_batch_serial') as uniqueness_constraint_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'labels_units' AND column_name = 'gs1_payload') as gs1_payload_column_exists,
  (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true AND tablename IN ('companies', 'seats', 'labels_units')) as rls_enabled_tables,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('companies', 'seats', 'labels_units')) as rls_policies_count
FROM information_schema.columns 
WHERE table_schema = 'public'
AND (
  (table_name = 'companies' AND column_name = 'user_id')
  OR (table_name = 'seats' AND column_name = 'user_id')
);

-- =====================================================
-- MANUAL TEST: RLS Policy Test (Requires Authenticated User)
-- =====================================================
-- Uncomment and replace 'YOUR_USER_ID' with actual authenticated user ID
-- This test should be run with an authenticated Supabase session

/*
-- Test RLS policy for companies
SELECT 
  'MANUAL TEST: RLS Companies' as test_name,
  id,
  company_name,
  user_id,
  CASE 
    WHEN user_id::text = auth.uid()::text THEN '✅ PASS - Can see own company'
    ELSE '❌ FAIL - Should not see this'
  END as status
FROM public.companies
WHERE user_id::text = auth.uid()::text
LIMIT 1;

-- Test RLS policy for seats
SELECT 
  'MANUAL TEST: RLS Seats' as test_name,
  id,
  company_id,
  user_id,
  status,
  CASE 
    WHEN user_id::text = auth.uid()::text THEN '✅ PASS - Can see own seat'
    ELSE '⚠️ WARNING - May be company seat'
  END as status
FROM public.seats
WHERE user_id::text = auth.uid()::text
LIMIT 1;
*/
