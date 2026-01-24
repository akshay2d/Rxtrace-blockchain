-- =====================================================
-- TEST SSCC QUOTA RPC FUNCTION
-- Run this to test the consume_quota_balance RPC directly
-- Replace COMPANY_ID with one of your company IDs from the diagnostic
-- =====================================================

-- Test 1: Try to consume 1 SSCC (should succeed)
SELECT 
  'Test: Consume 1 SSCC' as test_name,
  *
FROM consume_quota_balance(
  'da88b818-7a18-406f-9f12-65ae1b198010'::UUID,  -- Varsha food (has 218 remaining)
  'sscc'::TEXT,
  1::INTEGER
);

-- Test 2: Try to consume 10 SSCC (should succeed if remaining >= 10)
SELECT 
  'Test: Consume 10 SSCC' as test_name,
  *
FROM consume_quota_balance(
  'da88b818-7a18-406f-9f12-65ae1b198010'::UUID,  -- Varsha food (has 218 remaining)
  'sscc'::TEXT,
  10::INTEGER
);

-- Test 3: Try to consume 300 SSCC (should fail - only 218 remaining)
SELECT 
  'Test: Consume 300 SSCC (should fail)' as test_name,
  *
FROM consume_quota_balance(
  'da88b818-7a18-406f-9f12-65ae1b198010'::UUID,  -- Varsha food (has 218 remaining)
  'sscc'::TEXT,
  300::INTEGER
);

-- Test 4: Check if quota_balances row is locked or has issues
SELECT 
  qb.*,
  c.company_name,
  (qb.base_quota + qb.addon_quota - qb.used) as calculated_remaining
FROM quota_balances qb
JOIN companies c ON c.id = qb.company_id
WHERE qb.kind = 'sscc'
  AND qb.company_id = 'da88b818-7a18-406f-9f12-65ae1b198010'::UUID;
