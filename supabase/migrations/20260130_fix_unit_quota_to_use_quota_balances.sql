-- =====================================================
-- FIX UNIT QUOTA TO USE quota_balances TABLE
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
