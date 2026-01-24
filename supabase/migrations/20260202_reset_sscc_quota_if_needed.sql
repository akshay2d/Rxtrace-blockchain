-- =====================================================
-- RESET SSCC QUOTA IF NEEDED
-- This will force-set SSCC quota to plan defaults if it's 0/NULL
-- OR reset 'used' if it's incorrectly higher than quota
-- =====================================================

DO $$
DECLARE
  v_company RECORD;
  v_sscc_quota INTEGER;
  v_current_used INTEGER;
  v_plan TEXT;
BEGIN
  FOR v_company IN 
    SELECT DISTINCT c.id, COALESCE(c.subscription_plan, 'starter') as plan
    FROM companies c
  LOOP
    v_plan := v_company.plan;
    
    -- Get plan default SSCC quota
    v_sscc_quota := CASE 
      WHEN v_plan = 'starter' THEN 500
      WHEN v_plan = 'growth' THEN 2000
      WHEN v_plan = 'enterprise' THEN 10000
      ELSE 500
    END;
    
    -- Get current 'used' value (preserve it if valid)
    SELECT COALESCE(used, 0) INTO v_current_used
    FROM quota_balances
    WHERE company_id = v_company.id AND kind = 'sscc';
    
    -- If used is NULL or not found, set to 0
    IF v_current_used IS NULL THEN
      v_current_used := 0;
    END IF;
    
    -- If used is higher than quota, reset it to 0 (data corruption fix)
    IF v_current_used > v_sscc_quota THEN
      v_current_used := 0;
    END IF;
    
    -- Force insert/update with correct values
    INSERT INTO quota_balances (company_id, kind, base_quota, addon_quota, used)
    VALUES (v_company.id, 'sscc', v_sscc_quota, 0, v_current_used)
    ON CONFLICT (company_id, kind) 
    DO UPDATE SET
      base_quota = v_sscc_quota,  -- Always set to plan default
      used = LEAST(v_current_used, v_sscc_quota);  -- Cap used at quota
    
  END LOOP;
END $$;

-- Verify the fix
SELECT 
  c.company_name,
  qb.base_quota,
  qb.used,
  (qb.base_quota - qb.used) as remaining,
  CASE 
    WHEN qb.base_quota > 0 AND (qb.base_quota - qb.used) > 0 THEN '✅ FIXED'
    ELSE '❌ STILL HAS ISSUE'
  END as status
FROM companies c
JOIN quota_balances qb ON qb.company_id = c.id AND qb.kind = 'sscc'
ORDER BY c.created_at DESC;
