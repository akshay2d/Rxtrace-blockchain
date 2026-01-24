-- =====================================================
-- DEBUG: Check why SSCC quota consumption is failing
-- Run this to see exact quota values and calculation
-- =====================================================

-- 1. Check current quota_balances for your company
-- Replace 'YOUR_COMPANY_ID' with your actual company UUID
SELECT 
  'Current Quota Status' as check_type,
  qb.kind,
  qb.base_quota,
  qb.addon_quota,
  qb.used,
  (qb.base_quota + qb.addon_quota) as total_quota,
  (qb.base_quota + qb.addon_quota - qb.used) as remaining,
  CASE 
    WHEN qb.base_quota IS NULL THEN 'NULL base_quota'
    WHEN qb.base_quota = 0 THEN 'ZERO base_quota'
    WHEN (qb.base_quota + qb.addon_quota - qb.used) <= 0 THEN 'NO REMAINING QUOTA'
    WHEN (qb.base_quota + qb.addon_quota - qb.used) < 10 THEN 'LOW QUOTA'
    ELSE 'OK'
  END as status
FROM quota_balances qb
WHERE qb.kind = 'sscc'
ORDER BY qb.company_id;

-- 2. Test the consume_quota_balance RPC function directly
-- Replace 'YOUR_COMPANY_ID' with your actual company UUID and test with 1 SSCC
-- This will show you exactly what the RPC returns
SELECT * FROM consume_quota_balance(
  'YOUR_COMPANY_ID'::UUID,  -- Replace with your company_id
  'sscc'::TEXT,
  1::INTEGER
);

-- 3. Check if quota_balances row exists for SSCC
SELECT 
  c.id as company_id,
  c.company_name,
  CASE 
    WHEN qb.id IS NULL THEN 'MISSING quota_balances row'
    WHEN qb.base_quota IS NULL THEN 'base_quota is NULL'
    WHEN qb.base_quota = 0 THEN 'base_quota is ZERO'
    ELSE 'OK'
  END as issue
FROM companies c
LEFT JOIN quota_balances qb ON qb.company_id = c.id AND qb.kind = 'sscc'
ORDER BY c.created_at DESC;
