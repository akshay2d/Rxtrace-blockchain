-- Change sku_id from uuid to text in all tables
-- This allows SKU IDs to be human-readable strings like "PROD-123" or "Ciplox 200 mg"

-- 1. packing_rules table
ALTER TABLE packing_rules 
  ALTER COLUMN sku_id TYPE text;

-- 2. pallets table
ALTER TABLE pallets 
  ALTER COLUMN sku_id TYPE text;

-- 3. cartons table  
ALTER TABLE cartons 
  ALTER COLUMN sku_id TYPE text;

-- 4. boxes table
ALTER TABLE boxes 
  ALTER COLUMN sku_id TYPE text;

-- 5. strips_map table
ALTER TABLE strips_map 
  ALTER COLUMN sku_id TYPE text;

-- Update function signature for generate_full_hierarchy
CREATE OR REPLACE FUNCTION generate_full_hierarchy(
  p_company_id uuid,
  p_sku_id text,  -- Changed from uuid to text
  p_packing_rule_id uuid,
  p_total_strips integer
) RETURNS TABLE (
  request_id uuid,
  pallets_created integer,
  cartons_created integer,
  boxes_created integer,
  strips_created integer
) AS $$
DECLARE
  v_request_id uuid := gen_random_uuid();
  v_rule record;
  
  v_strips_per_box integer;
  v_boxes_per_carton integer;
  v_cartons_per_pallet integer;
  
  v_pallet_counter integer := 0;
  v_carton_counter integer := 0;
  v_box_counter integer := 0;
  v_strip_counter integer := 0;
  
  v_pallet_id uuid;
  v_carton_id uuid;
  v_box_id uuid;
  v_strip_code text;
  
  v_sscc text;
  v_sscc_with_ai text;
  
  v_strips_in_current_box integer := 0;
  v_boxes_in_current_carton integer := 0;
  v_cartons_in_current_pallet integer := 0;
BEGIN
  -- Get packing rule
  SELECT * INTO v_rule 
  FROM packing_rules 
  WHERE id = p_packing_rule_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Packing rule not found';
  END IF;
  
  v_strips_per_box := v_rule.strips_per_box;
  v_boxes_per_carton := v_rule.boxes_per_carton;
  v_cartons_per_pallet := v_rule.cartons_per_pallet;
  
  -- Insert generation request
  INSERT INTO generation_requests (
    company_id, request_id, sku_id, packing_rule_id,
    total_strips, started_at, status
  ) VALUES (
    p_company_id, v_request_id, p_sku_id, p_packing_rule_id,
    p_total_strips, now(), 'processing'
  );
  
  -- Loop through all strips and create hierarchy
  FOR i IN 1..p_total_strips LOOP
    v_strip_counter := v_strip_counter + 1;
    
    -- Need new pallet?
    IF v_cartons_in_current_pallet = 0 THEN
      v_pallet_counter := v_pallet_counter + 1;
      v_cartons_in_current_pallet := 0;
      
      v_strip_code := 'STRIP-' || p_sku_id || '-' || v_strip_counter;
      
      -- Generate SSCC
      v_sscc := make_sscc(
        v_rule.sscc_extension_digit::integer,
        v_rule.sscc_company_prefix,
        allocate_sscc_serials(v_rule.sscc_sequence_key, 1)
      );
      v_sscc_with_ai := '(00)' || v_sscc;
      
      INSERT INTO pallets (company_id, sku_id, packing_rule_id, sscc, sscc_with_ai, meta)
      VALUES (
        p_company_id, p_sku_id, p_packing_rule_id,
        v_sscc, v_sscc_with_ai, 
        jsonb_build_object('pallet_number', v_pallet_counter)
      )
      RETURNING id INTO v_pallet_id;
    END IF;
    
    -- Need new carton?
    IF v_boxes_in_current_carton = 0 THEN
      v_carton_counter := v_carton_counter + 1;
      INSERT INTO cartons (company_id, pallet_id, sku_id, code, meta)
      VALUES (
        p_company_id, v_pallet_id, p_sku_id,
        'CARTON-' || v_carton_counter::text,
        jsonb_build_object('carton_number', v_carton_counter)
      )
      RETURNING id INTO v_carton_id;
      v_boxes_in_current_carton := 0;
    END IF;
    
    -- Need new box?
    IF v_strips_in_current_box = 0 THEN
      v_box_counter := v_box_counter + 1;
      INSERT INTO boxes (company_id, carton_id, pallet_id, sku_id, code, meta)
      VALUES (
        p_company_id, v_carton_id, v_pallet_id, p_sku_id,
        'BOX-' || v_box_counter::text,
        jsonb_build_object('box_number', v_box_counter)
      )
      RETURNING id INTO v_box_id;
      v_strips_in_current_box := 0;
    END IF;
    
    -- Add strip to current box
    v_strip_code := 'STRIP-' || p_sku_id || '-' || v_strip_counter;
    INSERT INTO strips_map (strip_code, box_id, carton_id, pallet_id, sku_id)
    VALUES (v_strip_code, v_box_id, v_carton_id, v_pallet_id, p_sku_id);
    
    v_strips_in_current_box := v_strips_in_current_box + 1;
    
    -- Check if box is full
    IF v_strips_in_current_box >= v_strips_per_box THEN
      v_strips_in_current_box := 0;
      v_boxes_in_current_carton := v_boxes_in_current_carton + 1;
    END IF;
    
    -- Check if carton is full
    IF v_boxes_in_current_carton >= v_boxes_per_carton THEN
      v_boxes_in_current_carton := 0;
      v_cartons_in_current_pallet := v_cartons_in_current_pallet + 1;
    END IF;
    
    -- Check if pallet is full
    IF v_cartons_in_current_pallet >= v_cartons_per_pallet THEN
      v_cartons_in_current_pallet := 0;
    END IF;
  END LOOP;
  
  -- Update generation request status
  UPDATE generation_requests 
  SET status = 'completed',
      completed_at = now()
  WHERE request_id = v_request_id;
  
  RETURN QUERY SELECT 
    v_request_id,
    v_pallet_counter,
    v_carton_counter,
    v_box_counter,
    v_strip_counter;
END;
$$ LANGUAGE plpgsql;
