-- =====================================================
-- FORCE FIX SSCC QUOTA - Ensures all companies have valid SSCC quota
-- This migration aggressively fixes SSCC quota issues
-- =====================================================

-- 1. For ALL companies, ensure SSCC quota is properly set
-- This will update even if quota_balances already exists
DO $$
DECLARE
  v_company RECORD;
  v_sscc_quota INTEGER;
  v_unit_quota INTEGER;
BEGIN
  FOR v_company IN 
    SELECT DISTINCT c.id, COALESCE(c.subscription_plan, 'starter') as plan
    FROM companies c
  LOOP
    -- Initialize to NULL
    v_sscc_quota := NULL;
    v_unit_quota := NULL;
    
    -- Try to get from active billing_usage
    SELECT 
      COALESCE(bu.unit_labels_quota, 0),
      COALESCE(bu.pallet_labels_quota, 0)
    INTO v_unit_quota, v_sscc_quota
    FROM billing_usage bu
    WHERE bu.company_id = v_company.id
      AND bu.billing_period_start <= NOW()
      AND bu.billing_period_end > NOW()
    ORDER BY bu.billing_period_start DESC
    LIMIT 1;
    
    -- If no billing_usage found, variables remain NULL (handled below)

    -- Use plan defaults if no billing_usage or quota is 0
    IF v_sscc_quota IS NULL OR v_sscc_quota = 0 THEN
      v_sscc_quota := CASE 
        WHEN v_company.plan = 'starter' THEN 500
        WHEN v_company.plan = 'growth' THEN 2000
        WHEN v_company.plan = 'enterprise' THEN 10000
        ELSE 500
      END;
    END IF;

    IF v_unit_quota IS NULL OR v_unit_quota = 0 THEN
      v_unit_quota := CASE 
        WHEN v_company.plan = 'starter' THEN 200000
        WHEN v_company.plan = 'growth' THEN 1000000
        WHEN v_company.plan = 'enterprise' THEN 10000000
        ELSE 200000
      END;
    END IF;

    -- Force update SSCC quota_balance - always set if 0 or NULL
    INSERT INTO quota_balances (company_id, kind, base_quota, addon_quota, used)
    VALUES (v_company.id, 'sscc', v_sscc_quota, 0, COALESCE((SELECT used FROM quota_balances WHERE company_id = v_company.id AND kind = 'sscc'), 0))
    ON CONFLICT (company_id, kind) 
    DO UPDATE SET
      base_quota = CASE 
        WHEN quota_balances.base_quota IS NULL OR quota_balances.base_quota = 0 
        THEN v_sscc_quota
        ELSE GREATEST(quota_balances.base_quota, v_sscc_quota)
      END;

    -- Force update unit quota_balance
    INSERT INTO quota_balances (company_id, kind, base_quota, addon_quota, used)
    VALUES (v_company.id, 'unit', v_unit_quota, 0, COALESCE((SELECT used FROM quota_balances WHERE company_id = v_company.id AND kind = 'unit'), 0))
    ON CONFLICT (company_id, kind) 
    DO UPDATE SET
      base_quota = CASE 
        WHEN quota_balances.base_quota IS NULL OR quota_balances.base_quota = 0 
        THEN v_unit_quota
        ELSE GREATEST(quota_balances.base_quota, v_unit_quota)
      END;

  END LOOP;
END $$;

-- 2. Verify: Show companies with SSCC quota issues
DO $$
DECLARE
  v_zero_count INTEGER;
  v_missing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_zero_count
  FROM quota_balances qb
  WHERE qb.kind = 'sscc' AND (qb.base_quota IS NULL OR qb.base_quota = 0);
  
  SELECT COUNT(*) INTO v_missing_count
  FROM companies c
  WHERE NOT EXISTS (
    SELECT 1 FROM quota_balances qb 
    WHERE qb.company_id = c.id AND qb.kind = 'sscc'
  );
  
  IF v_zero_count > 0 OR v_missing_count > 0 THEN
    RAISE NOTICE 'Warning: % companies with zero SSCC quota, % companies missing SSCC quota', v_zero_count, v_missing_count;
  ELSE
    RAISE NOTICE 'Success: All companies have valid SSCC quota';
  END IF;
END $$;
