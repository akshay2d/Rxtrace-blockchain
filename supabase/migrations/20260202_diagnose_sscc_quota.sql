-- =====================================================
-- DIAGNOSTIC QUERY: Check SSCC Quota Status
-- Run this to see current quota_balances values for debugging
-- =====================================================

-- Check quota_balances for all companies
SELECT 
  c.id as company_id,
  c.company_name,
  c.subscription_plan,
  qb.kind,
  qb.base_quota,
  qb.addon_quota,
  qb.used,
  (qb.base_quota + qb.addon_quota - qb.used) as remaining,
  bu.pallet_labels_quota as billing_pallet_quota,
  bu.sscc_labels_quota as billing_sscc_quota
FROM companies c
LEFT JOIN quota_balances qb ON qb.company_id = c.id AND qb.kind = 'sscc'
LEFT JOIN billing_usage bu ON bu.company_id = c.id 
  AND bu.billing_period_start <= NOW() 
  AND bu.billing_period_end > NOW()
ORDER BY c.created_at DESC;

-- Check companies missing SSCC quota_balance
SELECT 
  c.id,
  c.company_name,
  c.subscription_plan,
  'MISSING SSCC QUOTA' as issue
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM quota_balances qb 
  WHERE qb.company_id = c.id AND qb.kind = 'sscc'
);

-- Check companies with 0 or NULL base_quota
SELECT 
  c.id,
  c.company_name,
  c.subscription_plan,
  qb.base_quota,
  qb.addon_quota,
  qb.used,
  'ZERO OR NULL BASE QUOTA' as issue
FROM companies c
JOIN quota_balances qb ON qb.company_id = c.id AND qb.kind = 'sscc'
WHERE qb.base_quota IS NULL OR qb.base_quota = 0;
