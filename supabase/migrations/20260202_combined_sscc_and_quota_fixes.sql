-- =====================================================
-- COMBINED MIGRATION: SSCC AND QUOTA FIXES
-- This migration combines all required fixes for SSCC code generation
-- Run this single migration instead of running individual migrations separately
-- All operations are idempotent (safe to run multiple times)
-- =====================================================

-- =====================================================
-- PART 1: FIX UNIT QUOTA TO USE quota_balances TABLE
-- Unit quota must be read ONLY from quota_balances (kind = 'unit')
-- =====================================================

-- Update consume_quota_and_insert_unit_labels to read from quota_balances table
CREATE OR REPLACE FUNCTION public.consume_quota_and_insert_unit_labels(
  p_company_id UUID,
  p_qty INTEGER,
  p_unit_rows JSONB,
  p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE(
  ok BOOLEAN,
  error TEXT,
  inserted_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quota_balance RECORD;
  v_current_base_quota INTEGER;
  v_current_addon_quota INTEGER;
  v_current_used INTEGER;
  v_row JSONB;
  v_inserted_ids UUID[];
  v_inserted_id UUID;
BEGIN
  -- Validate inputs
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN QUERY SELECT false, 'Quantity must be a positive integer'::TEXT, ARRAY[]::UUID[];
    RETURN;
  END IF;

  IF p_unit_rows IS NULL OR jsonb_array_length(p_unit_rows) != p_qty THEN
    RETURN QUERY SELECT false, 'Unit rows count must match quantity'::TEXT, ARRAY[]::UUID[];
    RETURN;
  END IF;

  -- Lock quota_balances row for unit (FOR UPDATE ensures atomicity)
  SELECT 
    base_quota,
    addon_quota,
    used
  INTO v_quota_balance
  FROM quota_balances
  WHERE company_id = p_company_id
    AND kind = 'unit'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Unit quota not initialized for company'::TEXT, ARRAY[]::UUID[];
    RETURN;
  END IF;

  v_current_base_quota := COALESCE(v_quota_balance.base_quota, 0);
  v_current_addon_quota := COALESCE(v_quota_balance.addon_quota, 0);
  v_current_used := COALESCE(v_quota_balance.used, 0);

  -- Check if sufficient quota is available
  -- Remaining quota = base_quota + addon_quota - used
  -- Block generation only if remaining <= 0
  IF (v_current_base_quota + v_current_addon_quota - v_current_used) <= 0 THEN
    RETURN QUERY SELECT 
      false,
      'Insufficient unit quota balance'::TEXT,
      ARRAY[]::UUID[];
    RETURN;
  END IF;

  -- Check if requested quantity exceeds remaining quota
  IF (v_current_base_quota + v_current_addon_quota - v_current_used) < p_qty THEN
    RETURN QUERY SELECT 
      false,
      'Insufficient unit quota balance'::TEXT,
      ARRAY[]::UUID[];
    RETURN;
  END IF;

  -- Increment used quota FIRST (before inserting labels)
  -- If label insertion fails, transaction will rollback and used will revert
  UPDATE quota_balances
  SET
    used = used + p_qty,
    updated_at = p_now
  WHERE company_id = p_company_id
    AND kind = 'unit';

  -- Now insert unit labels (within same transaction)
  -- If this fails, the entire transaction (including quota update) will rollback
  v_inserted_ids := ARRAY[]::UUID[];
  
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_unit_rows)
  LOOP
    INSERT INTO labels_units (
      company_id,
      sku_id,
      gtin,
      batch,
      mfd,
      expiry,
      mrp,
      serial,
      gs1_payload,
      created_at
    )
    VALUES (
      (v_row->>'company_id')::UUID,
      NULLIF(v_row->>'sku_id', 'null')::UUID,
      v_row->>'gtin',
      v_row->>'batch',
      -- Cast mfd text to DATE (handles YYYY-MM-DD format)
      (v_row->>'mfd')::DATE,
      -- Cast expiry text to DATE if column is DATE type, otherwise keep as TEXT
      (v_row->>'expiry')::DATE,
      -- Cast mrp text to DECIMAL(10,2), handle null values
      NULLIF(v_row->>'mrp', 'null')::DECIMAL(10,2),
      v_row->>'serial',
      v_row->>'gs1_payload',
      COALESCE((v_row->>'created_at')::TIMESTAMPTZ, p_now)
    )
    RETURNING id INTO v_inserted_id;
    
    v_inserted_ids := array_append(v_inserted_ids, v_inserted_id);
  END LOOP;

  -- Success: return inserted IDs
  RETURN QUERY SELECT 
    true,
    NULL::TEXT,
    v_inserted_ids;
EXCEPTION
  WHEN OTHERS THEN
    -- Rollback quota on any error
    UPDATE quota_balances
    SET used = GREATEST(0, used - p_qty)
    WHERE company_id = p_company_id
      AND kind = 'unit';
    
    RETURN QUERY SELECT 
      false,
      SQLERRM::TEXT,
      ARRAY[]::UUID[];
END;
$$;

-- Update consume_quota_balance to read unit quota from quota_balances table
CREATE OR REPLACE FUNCTION public.consume_quota_balance(
  p_company_id UUID,
  p_kind TEXT, -- 'unit' or 'sscc'
  p_qty INTEGER,
  p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE(
  ok BOOLEAN,
  unit_balance INTEGER,
  sscc_balance INTEGER,
  unit_addon_balance INTEGER,
  sscc_addon_balance INTEGER,
  error TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_quota_balance RECORD;
  v_current_base_quota INTEGER;
  v_current_addon_quota INTEGER;
  v_current_used INTEGER;
  v_remaining INTEGER;
  v_unit_balance INTEGER;
  v_sscc_balance INTEGER;
  v_unit_addon INTEGER;
  v_sscc_addon INTEGER;
BEGIN
  -- Validate kind
  IF p_kind NOT IN ('unit', 'sscc') THEN
    RETURN QUERY SELECT false, NULL::INTEGER, NULL::INTEGER, NULL::INTEGER, NULL::INTEGER, 'Invalid kind. Must be unit or sscc'::TEXT;
    RETURN;
  END IF;

  -- For unit, read from quota_balances table
  IF p_kind = 'unit' THEN
    -- Lock quota_balances row for unit
    SELECT 
      base_quota,
      addon_quota,
      used
    INTO v_quota_balance
    FROM quota_balances
    WHERE company_id = p_company_id
      AND kind = 'unit'
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT false, NULL::INTEGER, NULL::INTEGER, NULL::INTEGER, NULL::INTEGER, 'Unit quota not initialized for company'::TEXT;
      RETURN;
    END IF;

    v_current_base_quota := COALESCE(v_quota_balance.base_quota, 0);
    v_current_addon_quota := COALESCE(v_quota_balance.addon_quota, 0);
    v_current_used := COALESCE(v_quota_balance.used, 0);

    -- Check available quota: remaining = base_quota + addon_quota - used
    v_remaining := (v_current_base_quota + v_current_addon_quota) - v_current_used;
    
    IF v_remaining < p_qty THEN
      -- Get SSCC balances for return (read-only, no lock needed)
      SELECT 
        COALESCE(base_quota, 0) - COALESCE(used, 0),
        COALESCE(addon_quota, 0)
      INTO v_sscc_balance, v_sscc_addon
      FROM quota_balances
      WHERE company_id = p_company_id
        AND kind = 'sscc'
      LIMIT 1;

      RETURN QUERY SELECT 
        false,
        v_remaining,
        COALESCE(v_sscc_balance, 0),
        v_current_addon_quota,
        COALESCE(v_sscc_addon, 0),
        'Insufficient unit quota balance'::TEXT;
      RETURN;
    END IF;

    -- Update quota_balances: increment used
    UPDATE quota_balances
    SET
      used = used + p_qty,
      updated_at = p_now
    WHERE company_id = p_company_id
      AND kind = 'unit';

    -- Get SSCC balances for return (read-only)
    SELECT 
      COALESCE(base_quota, 0) - COALESCE(used, 0),
      COALESCE(addon_quota, 0)
    INTO v_sscc_balance, v_sscc_addon
    FROM quota_balances
    WHERE company_id = p_company_id
      AND kind = 'sscc'
    LIMIT 1;

    -- Calculate new unit remaining after consumption
    v_unit_balance := (v_current_base_quota + v_current_addon_quota) - (v_current_used + p_qty);

    RETURN QUERY SELECT 
      true,
      v_unit_balance,
      COALESCE(v_sscc_balance, 0),
      v_current_addon_quota,
      COALESCE(v_sscc_addon, 0),
      NULL::TEXT;

  ELSE
    -- For SSCC, read from quota_balances table (already implemented)
    -- Lock quota_balances row for SSCC
    SELECT 
      base_quota,
      addon_quota,
      used
    INTO v_quota_balance
    FROM quota_balances
    WHERE company_id = p_company_id
      AND kind = 'sscc'
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT false, NULL::INTEGER, NULL::INTEGER, NULL::INTEGER, NULL::INTEGER, 'SSCC quota not initialized for company'::TEXT;
      RETURN;
    END IF;

    v_current_base_quota := COALESCE(v_quota_balance.base_quota, 0);
    v_current_addon_quota := COALESCE(v_quota_balance.addon_quota, 0);
    v_current_used := COALESCE(v_quota_balance.used, 0);

    -- Check available quota: remaining = base_quota + addon_quota - used
    v_remaining := (v_current_base_quota + v_current_addon_quota) - v_current_used;
    
    IF v_remaining < p_qty THEN
      -- Get unit balances for return (read-only, no lock needed)
      SELECT 
        COALESCE(base_quota, 0) - COALESCE(used, 0),
        COALESCE(addon_quota, 0)
      INTO v_unit_balance, v_unit_addon
      FROM quota_balances
      WHERE company_id = p_company_id
        AND kind = 'unit'
      LIMIT 1;

      RETURN QUERY SELECT 
        false,
        COALESCE(v_unit_balance, 0),
        v_remaining,
        COALESCE(v_unit_addon, 0),
        v_current_addon_quota,
        'Insufficient SSCC quota balance'::TEXT;
      RETURN;
    END IF;

    -- Update quota_balances: increment used
    UPDATE quota_balances
    SET
      used = used + p_qty,
      updated_at = p_now
    WHERE company_id = p_company_id
      AND kind = 'sscc';

    -- Get unit balances for return (read-only)
    SELECT 
      COALESCE(base_quota, 0) - COALESCE(used, 0),
      COALESCE(addon_quota, 0)
    INTO v_unit_balance, v_unit_addon
    FROM quota_balances
    WHERE company_id = p_company_id
      AND kind = 'unit'
    LIMIT 1;

    -- Calculate new SSCC remaining after consumption
    v_sscc_balance := (v_current_base_quota + v_current_addon_quota) - (v_current_used + p_qty);

    RETURN QUERY SELECT 
      true,
      COALESCE(v_unit_balance, 0),
      v_sscc_balance,
      COALESCE(v_unit_addon, 0),
      v_current_addon_quota,
      NULL::TEXT;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.consume_quota_and_insert_unit_labels IS 'Atomically consumes unit quota from quota_balances table and inserts unit labels. Quota is only consumed if labels are successfully inserted.';
COMMENT ON FUNCTION public.consume_quota_balance IS 'Consumes quota from quota_balances table for both unit and SSCC kinds.';

-- =====================================================
-- PART 2: ADD MISSING COLUMNS TO BOXES, CARTONS, PALLETS TABLES
-- Ensures all required columns exist for SSCC generation
-- =====================================================

-- Add all required columns to boxes table
DO $$
BEGIN
  -- Add sku_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'sku_id'
  ) THEN
    ALTER TABLE boxes ADD COLUMN sku_id UUID REFERENCES skus(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_boxes_sku_id ON boxes(sku_id) WHERE sku_id IS NOT NULL;
    RAISE NOTICE 'Added sku_id column to boxes table';
  END IF;
  
  -- Add sscc if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'sscc'
  ) THEN
    ALTER TABLE boxes ADD COLUMN sscc VARCHAR(18);
    CREATE INDEX IF NOT EXISTS idx_boxes_sscc ON boxes(sscc) WHERE sscc IS NOT NULL;
    RAISE NOTICE 'Added sscc column to boxes table';
  END IF;
  
  -- Add sscc_with_ai if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'sscc_with_ai'
  ) THEN
    ALTER TABLE boxes ADD COLUMN sscc_with_ai TEXT;
    RAISE NOTICE 'Added sscc_with_ai column to boxes table';
  END IF;
  
  -- Add sscc_level if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'sscc_level'
  ) THEN
    ALTER TABLE boxes ADD COLUMN sscc_level TEXT CHECK (sscc_level IN ('box', 'carton', 'pallet'));
    CREATE INDEX IF NOT EXISTS idx_boxes_sscc_level ON boxes(sscc_level) WHERE sscc_level IS NOT NULL;
    RAISE NOTICE 'Added sscc_level column to boxes table';
  END IF;
  
  -- Add parent_sscc if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'parent_sscc'
  ) THEN
    ALTER TABLE boxes ADD COLUMN parent_sscc TEXT;
    CREATE INDEX IF NOT EXISTS idx_boxes_parent_sscc ON boxes(parent_sscc) WHERE parent_sscc IS NOT NULL;
    RAISE NOTICE 'Added parent_sscc column to boxes table';
  END IF;
  
  -- Add code column if missing (required for SSCC generation)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'code'
  ) THEN
    ALTER TABLE boxes ADD COLUMN code TEXT;
    CREATE INDEX IF NOT EXISTS idx_boxes_code ON boxes(code) WHERE code IS NOT NULL;
    RAISE NOTICE 'Added code column to boxes table';
  END IF;
END $$;

-- Add all required columns to cartons table
DO $$
BEGIN
  -- Add sku_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cartons' AND column_name = 'sku_id'
  ) THEN
    ALTER TABLE cartons ADD COLUMN sku_id UUID REFERENCES skus(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_cartons_sku_id ON cartons(sku_id) WHERE sku_id IS NOT NULL;
    RAISE NOTICE 'Added sku_id column to cartons table';
  END IF;
  
  -- Add sscc if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cartons' AND column_name = 'sscc'
  ) THEN
    ALTER TABLE cartons ADD COLUMN sscc VARCHAR(18);
    CREATE INDEX IF NOT EXISTS idx_cartons_sscc ON cartons(sscc) WHERE sscc IS NOT NULL;
    RAISE NOTICE 'Added sscc column to cartons table';
  END IF;
  
  -- Add sscc_with_ai if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cartons' AND column_name = 'sscc_with_ai'
  ) THEN
    ALTER TABLE cartons ADD COLUMN sscc_with_ai TEXT;
    RAISE NOTICE 'Added sscc_with_ai column to cartons table';
  END IF;
  
  -- Add sscc_level if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cartons' AND column_name = 'sscc_level'
  ) THEN
    ALTER TABLE cartons ADD COLUMN sscc_level TEXT CHECK (sscc_level IN ('box', 'carton', 'pallet'));
    CREATE INDEX IF NOT EXISTS idx_cartons_sscc_level ON cartons(sscc_level) WHERE sscc_level IS NOT NULL;
    RAISE NOTICE 'Added sscc_level column to cartons table';
  END IF;
  
  -- Add parent_sscc if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cartons' AND column_name = 'parent_sscc'
  ) THEN
    ALTER TABLE cartons ADD COLUMN parent_sscc TEXT;
    CREATE INDEX IF NOT EXISTS idx_cartons_parent_sscc ON cartons(parent_sscc) WHERE parent_sscc IS NOT NULL;
    RAISE NOTICE 'Added parent_sscc column to cartons table';
  END IF;
  
  -- Add code column if missing (required for SSCC generation)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cartons' AND column_name = 'code'
  ) THEN
    ALTER TABLE cartons ADD COLUMN code TEXT;
    CREATE INDEX IF NOT EXISTS idx_cartons_code ON cartons(code) WHERE code IS NOT NULL;
    RAISE NOTICE 'Added code column to cartons table';
  END IF;
END $$;

-- Add all required columns to pallets table
DO $$
BEGIN
  -- Add sku_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pallets' AND column_name = 'sku_id'
  ) THEN
    ALTER TABLE pallets ADD COLUMN sku_id UUID REFERENCES skus(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_pallets_sku_id ON pallets(sku_id) WHERE sku_id IS NOT NULL;
    RAISE NOTICE 'Added sku_id column to pallets table';
  END IF;
  
  -- Add sscc if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pallets' AND column_name = 'sscc'
  ) THEN
    ALTER TABLE pallets ADD COLUMN sscc VARCHAR(18);
    CREATE INDEX IF NOT EXISTS idx_pallets_sscc ON pallets(sscc) WHERE sscc IS NOT NULL;
    RAISE NOTICE 'Added sscc column to pallets table';
  END IF;
  
  -- Add sscc_with_ai if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pallets' AND column_name = 'sscc_with_ai'
  ) THEN
    ALTER TABLE pallets ADD COLUMN sscc_with_ai TEXT;
    RAISE NOTICE 'Added sscc_with_ai column to pallets table';
  END IF;
  
  -- Add sscc_level if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pallets' AND column_name = 'sscc_level'
  ) THEN
    ALTER TABLE pallets ADD COLUMN sscc_level TEXT CHECK (sscc_level IN ('box', 'carton', 'pallet'));
    CREATE INDEX IF NOT EXISTS idx_pallets_sscc_level ON pallets(sscc_level) WHERE sscc_level IS NOT NULL;
    RAISE NOTICE 'Added sscc_level column to pallets table';
  END IF;
  
  -- Add parent_sscc if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pallets' AND column_name = 'parent_sscc'
  ) THEN
    ALTER TABLE pallets ADD COLUMN parent_sscc TEXT;
    CREATE INDEX IF NOT EXISTS idx_pallets_parent_sscc ON pallets(parent_sscc) WHERE parent_sscc IS NOT NULL;
    RAISE NOTICE 'Added parent_sscc column to pallets table';
  END IF;
  
  -- Add code column if missing (required for SSCC generation)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pallets' AND column_name = 'code'
  ) THEN
    ALTER TABLE pallets ADD COLUMN code TEXT;
    CREATE INDEX IF NOT EXISTS idx_pallets_code ON pallets(code) WHERE code IS NOT NULL;
    RAISE NOTICE 'Added code column to pallets table';
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN boxes.sscc_level IS 'SSCC hierarchy level: box, carton, or pallet';
COMMENT ON COLUMN boxes.parent_sscc IS 'Parent SSCC code (for hierarchy: box -> carton -> pallet)';
COMMENT ON COLUMN cartons.sscc_level IS 'SSCC hierarchy level: box, carton, or pallet';
COMMENT ON COLUMN cartons.parent_sscc IS 'Parent SSCC code (for hierarchy: box -> carton -> pallet)';
COMMENT ON COLUMN pallets.sscc_level IS 'SSCC hierarchy level: box, carton, or pallet';
COMMENT ON COLUMN pallets.parent_sscc IS 'Parent SSCC code (for hierarchy: box -> carton -> pallet)';

-- =====================================================
-- PART 3: FORCE FIX SSCC QUOTA - Ensures all companies have valid SSCC quota
-- This migration aggressively fixes SSCC quota issues
-- =====================================================

-- For ALL companies, ensure SSCC quota is properly set
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

-- Verify: Show companies with SSCC quota issues
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

-- =====================================================
-- PART 4: FIX code COLUMN TO BE NULLABLE
-- The code column should be nullable (can use sscc as fallback)
-- This is a safety measure since route.ts now sets the code field
-- =====================================================

-- Make code nullable in boxes table if it has NOT NULL constraint
DO $$
BEGIN
  -- Check if code column exists and has NOT NULL constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'boxes' 
    AND column_name = 'code'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE boxes ALTER COLUMN code DROP NOT NULL;
    RAISE NOTICE 'Removed NOT NULL constraint from boxes.code';
  ELSE
    RAISE NOTICE 'boxes.code is already nullable or does not exist';
  END IF;
END $$;

-- Make code nullable in cartons table if it has NOT NULL constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'cartons' 
    AND column_name = 'code'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE cartons ALTER COLUMN code DROP NOT NULL;
    RAISE NOTICE 'Removed NOT NULL constraint from cartons.code';
  ELSE
    RAISE NOTICE 'cartons.code is already nullable or does not exist';
  END IF;
END $$;

-- Make code nullable in pallets table if it has NOT NULL constraint
-- (code column is now added in Part 2 above, so this ensures it's nullable)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'pallets' 
    AND column_name = 'code'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE pallets ALTER COLUMN code DROP NOT NULL;
    RAISE NOTICE 'Removed NOT NULL constraint from pallets.code';
  ELSE
    RAISE NOTICE 'pallets.code is already nullable or does not exist';
  END IF;
END $$;

-- =====================================================
-- VERIFICATION: Check that all required columns exist
-- =====================================================

SELECT 
  'boxes' as table_name,
  'sku_id' as column_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'sku_id'
  ) THEN '✅ exists' ELSE '❌ missing' END as status
UNION ALL
SELECT 'boxes', 'sscc',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'sscc'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'boxes', 'sscc_with_ai',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'sscc_with_ai'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'boxes', 'sscc_level',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'sscc_level'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'boxes', 'parent_sscc',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'parent_sscc'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'boxes', 'code',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'code'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'cartons', 'sku_id',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cartons' AND column_name = 'sku_id'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'cartons', 'sscc',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cartons' AND column_name = 'sscc'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'cartons', 'sscc_with_ai',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cartons' AND column_name = 'sscc_with_ai'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'cartons', 'code',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cartons' AND column_name = 'code'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'pallets', 'sku_id',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pallets' AND column_name = 'sku_id'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'pallets', 'sscc',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pallets' AND column_name = 'sscc'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'pallets', 'sscc_with_ai',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pallets' AND column_name = 'sscc_with_ai'
  ) THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'pallets', 'code',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'pallets' AND column_name = 'code'
  ) THEN '✅ exists' ELSE '❌ missing' END;
