-- =====================================================
-- FIX SSCC QUOTA INITIALIZATION FOR ALL COMPANIES
-- Ensures all companies have SSCC quota properly initialized in quota_balances
-- Syncs from billing_usage or uses plan defaults
-- =====================================================

-- 1. For companies with active billing_usage, sync SSCC quota to quota_balances
-- SSCC quota = pallet_labels_quota (primary SSCC level)
-- Note: Using pallet_labels_quota directly since sscc_labels_quota may not exist
DO $$
DECLARE
  v_company RECORD;
  v_sscc_quota INTEGER;
  v_unit_quota INTEGER;
BEGIN
  -- Loop through all companies
  FOR v_company IN 
    SELECT DISTINCT c.id, c.subscription_plan
    FROM companies c
  LOOP
    -- Initialize variables to NULL
    v_unit_quota := NULL;
    v_sscc_quota := NULL;
    
    -- Get quotas from active billing_usage
    -- SSCC quota = pallet_labels_quota (primary SSCC level)
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

    -- If no active billing_usage found OR quota is 0, use plan defaults
    IF v_sscc_quota IS NULL OR v_sscc_quota = 0 THEN
      v_sscc_quota := CASE 
        WHEN v_company.subscription_plan = 'starter' THEN 500
        WHEN v_company.subscription_plan = 'growth' THEN 2000
        WHEN v_company.subscription_plan = 'enterprise' THEN 10000
        ELSE 500
      END;
    END IF;

    IF v_unit_quota IS NULL OR v_unit_quota = 0 THEN
      v_unit_quota := CASE 
        WHEN v_company.subscription_plan = 'starter' THEN 200000
        WHEN v_company.subscription_plan = 'growth' THEN 1000000
        WHEN v_company.subscription_plan = 'enterprise' THEN 10000000
        ELSE 200000
      END;
    END IF;

    -- Ensure unit quota_balance exists and has correct base_quota
    INSERT INTO quota_balances (company_id, kind, base_quota, addon_quota, used)
    VALUES (v_company.id, 'unit', v_unit_quota, 0, 0)
    ON CONFLICT (company_id, kind) 
    DO UPDATE SET
      -- Only update base_quota if current is 0 or NULL, or if new value is higher
      base_quota = CASE 
        WHEN quota_balances.base_quota IS NULL OR quota_balances.base_quota = 0 
        THEN GREATEST(v_unit_quota, quota_balances.base_quota)
        ELSE GREATEST(quota_balances.base_quota, v_unit_quota)
      END;

    -- Ensure SSCC quota_balance exists and has correct base_quota
    -- Always set base_quota if it's 0, NULL, or if new value is higher
    INSERT INTO quota_balances (company_id, kind, base_quota, addon_quota, used)
    VALUES (v_company.id, 'sscc', v_sscc_quota, 0, 0)
    ON CONFLICT (company_id, kind) 
    DO UPDATE SET
      base_quota = CASE 
        WHEN quota_balances.base_quota IS NULL OR quota_balances.base_quota = 0 
        THEN v_sscc_quota
        ELSE GREATEST(quota_balances.base_quota, v_sscc_quota)
      END;

  END LOOP;
END $$;

-- 2. For companies that still don't have quota_balances, initialize directly
-- This handles edge cases where companies might have been missed
DO $$
DECLARE
  v_company RECORD;
  v_plan_type TEXT;
  v_unit_quota INTEGER;
  v_sscc_quota INTEGER;
BEGIN
  FOR v_company IN 
    SELECT c.id, COALESCE(c.subscription_plan, 'starter') as plan
    FROM companies c
    WHERE NOT EXISTS (
      SELECT 1 FROM quota_balances qb 
      WHERE qb.company_id = c.id AND qb.kind = 'sscc'
    )
  LOOP
    v_plan_type := CASE 
      WHEN v_company.plan = 'starter' THEN 'starter'
      WHEN v_company.plan = 'growth' THEN 'growth'
      WHEN v_company.plan = 'enterprise' THEN 'enterprise'
      ELSE 'starter'
    END;

    -- Use plan defaults
    v_unit_quota := CASE 
      WHEN v_plan_type = 'starter' THEN 200000
      WHEN v_plan_type = 'growth' THEN 1000000
      WHEN v_plan_type = 'enterprise' THEN 10000000
      ELSE 200000
    END;
    
    v_sscc_quota := CASE 
      WHEN v_plan_type = 'starter' THEN 500
      WHEN v_plan_type = 'growth' THEN 2000
      WHEN v_plan_type = 'enterprise' THEN 10000
      ELSE 500
    END;

    -- Initialize unit quota_balance
    INSERT INTO quota_balances (company_id, kind, base_quota, addon_quota, used)
    VALUES (v_company.id, 'unit', v_unit_quota, 0, 0)
    ON CONFLICT (company_id, kind) DO NOTHING;

    -- Initialize SSCC quota_balance
    INSERT INTO quota_balances (company_id, kind, base_quota, addon_quota, used)
    VALUES (v_company.id, 'sscc', v_sscc_quota, 0, 0)
    ON CONFLICT (company_id, kind) DO NOTHING;
  END LOOP;
END $$;

-- 3. Verify: Check for any companies still missing SSCC quota
-- This is just for logging/debugging - won't fail migration
DO $$
DECLARE
  v_missing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_missing_count
  FROM companies c
  WHERE NOT EXISTS (
    SELECT 1 FROM quota_balances qb 
    WHERE qb.company_id = c.id AND qb.kind = 'sscc'
  );

  IF v_missing_count > 0 THEN
    RAISE NOTICE 'Warning: % companies still missing SSCC quota_balance after migration', v_missing_count;
  ELSE
    RAISE NOTICE 'Success: All companies have SSCC quota_balance initialized';
  END IF;
END $$;
