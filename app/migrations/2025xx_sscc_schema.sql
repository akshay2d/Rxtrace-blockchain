-- Packing rules table
CREATE TABLE IF NOT EXISTS packing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  name text,
  strips_per_box integer NOT NULL CHECK (strips_per_box > 0),
  boxes_per_carton integer NOT NULL CHECK (boxes_per_carton > 0),
  cartons_per_pallet integer NOT NULL CHECK (cartons_per_pallet > 0),
  allow_partial_last_container boolean NOT NULL DEFAULT true,
  sscc_extension_digit smallint NOT NULL DEFAULT 0,
  sscc_company_prefix text NOT NULL,
  sscc_sequence_key text NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sku_id, version)
);

-- SSCC counters table
CREATE TABLE IF NOT EXISTS sscc_counters (
  sequence_key text PRIMARY KEY,
  last_serial bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Pallets table
CREATE TABLE IF NOT EXISTS pallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  sku_id uuid,
  packing_rule_id uuid,
  sscc varchar(18) NOT NULL UNIQUE,
  sscc_with_ai text,
  meta jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Cartons table
CREATE TABLE IF NOT EXISTS cartons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  pallet_id uuid REFERENCES pallets(id) ON DELETE SET NULL,
  sku_id uuid,
  code text NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Boxes table
CREATE TABLE IF NOT EXISTS boxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carton_id uuid REFERENCES cartons(id) ON DELETE SET NULL,
  company_id uuid NOT NULL,
  code text NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Strip mapping
CREATE TABLE IF NOT EXISTS strips_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strip_code text NOT NULL,
  box_id uuid REFERENCES boxes(id) ON DELETE SET NULL,
  carton_id uuid REFERENCES cartons(id) ON DELETE SET NULL,
  pallet_id uuid REFERENCES pallets(id) ON DELETE SET NULL,
  sku_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(strip_code)
);

-- Generation jobs
CREATE TABLE IF NOT EXISTS generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  request_id text UNIQUE,
  sku_id uuid,
  packing_rule_id uuid,
  total_strips bigint,
  expected_boxes integer,
  expected_cartons integer,
  expected_pallets integer,
  status text NOT NULL DEFAULT 'PENDING',
  error_text text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- POSTGRESQL FUNCTIONS
-- ============================================

-- Function 1: Atomic SSCC serial allocation
CREATE OR REPLACE FUNCTION allocate_sscc_serials(
  p_sequence_key text,
  p_count integer
) RETURNS bigint AS $$
DECLARE
  v_first_serial bigint;
BEGIN
  -- Insert or update counter atomically
  INSERT INTO sscc_counters (sequence_key, last_serial, updated_at)
  VALUES (p_sequence_key, p_count, now())
  ON CONFLICT (sequence_key) DO UPDATE
  SET last_serial = sscc_counters.last_serial + p_count,
      updated_at = now()
  RETURNING last_serial - p_count + 1 INTO v_first_serial;
  
  RETURN v_first_serial;
END;
$$ LANGUAGE plpgsql;

-- Function 2: Generate SSCC with GS1 check digit
CREATE OR REPLACE FUNCTION make_sscc(
  p_extension_digit smallint,
  p_company_prefix text,
  p_serial bigint
) RETURNS text AS $$
DECLARE
  v_base text;
  v_digits text;
  v_sum integer := 0;
  v_digit integer;
  v_weight integer;
  v_check_digit integer;
  i integer;
BEGIN
  -- Build 17-digit base: extension (1) + company prefix (7-9) + serial (remaining)
  v_base := p_extension_digit::text || p_company_prefix || lpad(p_serial::text, 17 - 1 - length(p_company_prefix), '0');
  
  -- Ensure exactly 17 digits
  v_base := substring(v_base, 1, 17);
  
  -- Calculate GS1 check digit (mod-10 weighted sum, right-to-left with alternating 3-1 weights)
  FOR i IN 1..17 LOOP
    v_digit := substring(v_base, i, 1)::integer;
    
    -- Weight alternates 3,1,3,1... from RIGHT (position 17 is weight 3, 16 is 1, etc.)
    IF (17 - i + 1) % 2 = 1 THEN
      v_weight := 3;
    ELSE
      v_weight := 1;
    END IF;
    
    v_sum := v_sum + (v_digit * v_weight);
  END LOOP;
  
  -- Check digit = (10 - (sum mod 10)) mod 10
  v_check_digit := (10 - (v_sum % 10)) % 10;
  
  -- Return 18-digit SSCC
  RETURN v_base || v_check_digit::text;
END;
$$ LANGUAGE plpgsql;

-- Function 3: Create full packaging hierarchy
CREATE OR REPLACE FUNCTION create_full_hierarchy(
  p_company_id uuid,
  p_sku_id uuid,
  p_packing_rule_id uuid,
  p_total_strips bigint,
  p_request_id text DEFAULT NULL,
  p_strip_codes text[] DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_rule record;
  v_job_id uuid;
  v_request_id text;
  
  v_strips_per_box integer;
  v_boxes_per_carton integer;
  v_cartons_per_pallet integer;
  
  v_total_boxes integer;
  v_total_cartons integer;
  v_total_pallets integer;
  
  v_first_serial bigint;
  v_pallet_sscc text;
  v_pallet_id uuid;
  v_carton_id uuid;
  v_box_id uuid;
  
  v_pallet_counter integer := 0;
  v_carton_counter integer := 0;
  v_box_counter integer := 0;
  v_strip_counter integer := 0;
  
  v_cartons_in_current_pallet integer := 0;
  v_boxes_in_current_carton integer := 0;
  v_strips_in_current_box integer := 0;
  
  v_strip_code text;
  v_strip_idx integer := 0;
BEGIN
  -- Get packing rule
  SELECT * INTO v_rule FROM packing_rules WHERE id = p_packing_rule_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Packing rule not found: %', p_packing_rule_id;
  END IF;
  
  v_strips_per_box := v_rule.strips_per_box;
  v_boxes_per_carton := v_rule.boxes_per_carton;
  v_cartons_per_pallet := v_rule.cartons_per_pallet;
  
  -- Calculate totals
  v_total_boxes := ceil(p_total_strips::numeric / v_strips_per_box);
  v_total_cartons := ceil(v_total_boxes::numeric / v_boxes_per_carton);
  v_total_pallets := ceil(v_total_cartons::numeric / v_cartons_per_pallet);
  
  -- Create generation job
  v_request_id := COALESCE(p_request_id, 'job-' || extract(epoch from now())::bigint || '-' || floor(random() * 1000)::integer);
  
  INSERT INTO generation_jobs (
    company_id, request_id, sku_id, packing_rule_id,
    total_strips, expected_boxes, expected_cartons, expected_pallets,
    status
  ) VALUES (
    p_company_id, v_request_id, p_sku_id, p_packing_rule_id,
    p_total_strips, v_total_boxes, v_total_cartons, v_total_pallets,
    'PROCESSING'
  ) RETURNING id INTO v_job_id;
  
  -- Allocate SSCC serials for all pallets
  v_first_serial := allocate_sscc_serials(v_rule.sscc_company_prefix, v_total_pallets);
  
  -- Generate hierarchy (strip → box → carton → pallet)
  FOR v_strip_counter IN 1..p_total_strips LOOP
    -- Get strip code (either from provided array or generate placeholder)
    IF p_strip_codes IS NOT NULL AND array_length(p_strip_codes, 1) >= v_strip_counter THEN
      v_strip_code := p_strip_codes[v_strip_counter];
    ELSE
      v_strip_code := 'STRIP-' || p_sku_id || '-' || v_strip_counter;
    END IF;
    
    -- Create new box if needed
    IF v_strips_in_current_box = 0 THEN
      v_box_counter := v_box_counter + 1;
      
      -- Create new carton if needed
      IF v_boxes_in_current_carton = 0 THEN
        v_carton_counter := v_carton_counter + 1;
        
        -- Create new pallet if needed
        IF v_cartons_in_current_pallet = 0 THEN
          v_pallet_counter := v_pallet_counter + 1;
          
          -- Generate SSCC for this pallet
          v_pallet_sscc := make_sscc(
            v_rule.sscc_extension_digit::smallint,
            v_rule.sscc_company_prefix,
            v_first_serial + v_pallet_counter - 1
          );
          
          -- Insert pallet
          INSERT INTO pallets (company_id, sku_id, packing_rule_id, sscc, sscc_with_ai, meta)
          VALUES (
            p_company_id, p_sku_id, p_packing_rule_id,
            v_pallet_sscc,
            '(00)' || v_pallet_sscc,
            jsonb_build_object('job_id', v_job_id, 'pallet_num', v_pallet_counter)
          )
          RETURNING id INTO v_pallet_id;
        END IF;
        
        -- Insert carton
        INSERT INTO cartons (company_id, pallet_id, sku_id, code, meta)
        VALUES (
          p_company_id, v_pallet_id, p_sku_id,
          'CARTON-' || v_pallet_counter || '-' || (v_cartons_in_current_pallet + 1),
          jsonb_build_object('job_id', v_job_id, 'carton_num', v_carton_counter)
        )
        RETURNING id INTO v_carton_id;
        
        v_cartons_in_current_pallet := v_cartons_in_current_pallet + 1;
      END IF;
      
      -- Insert box
      INSERT INTO boxes (carton_id, company_id, code, meta)
      VALUES (
        v_carton_id, p_company_id,
        'BOX-' || v_carton_counter || '-' || (v_boxes_in_current_carton + 1),
        jsonb_build_object('job_id', v_job_id, 'box_num', v_box_counter)
      )
      RETURNING id INTO v_box_id;
      
      v_boxes_in_current_carton := v_boxes_in_current_carton + 1;
    END IF;
    
    -- Insert strip mapping
    INSERT INTO strips_map (strip_code, box_id, carton_id, pallet_id, sku_id)
    VALUES (v_strip_code, v_box_id, v_carton_id, v_pallet_id, p_sku_id);
    
    v_strips_in_current_box := v_strips_in_current_box + 1;
    
    -- Check if box is full
    IF v_strips_in_current_box >= v_strips_per_box THEN
      v_strips_in_current_box := 0;
      
      -- Check if carton is full
      IF v_boxes_in_current_carton >= v_boxes_per_carton THEN
        v_boxes_in_current_carton := 0;
        
        -- Check if pallet is full
        IF v_cartons_in_current_pallet >= v_cartons_per_pallet THEN
          v_cartons_in_current_pallet := 0;
        END IF;
      END IF;
    END IF;
  END LOOP;
  
  -- Update job status
  UPDATE generation_jobs
  SET status = 'COMPLETED', updated_at = now()
  WHERE id = v_job_id;
  
  -- Return summary
  RETURN jsonb_build_object(
    'job_id', v_job_id,
    'request_id', v_request_id,
    'status', 'COMPLETED',
    'total_strips', p_total_strips,
    'total_boxes', v_box_counter,
    'total_cartons', v_carton_counter,
    'total_pallets', v_pallet_counter,
    'packing_rule', jsonb_build_object(
      'strips_per_box', v_strips_per_box,
      'boxes_per_carton', v_boxes_per_carton,
      'cartons_per_pallet', v_cartons_per_pallet
    )
  );
  
EXCEPTION WHEN OTHERS THEN
  -- Update job with error
  IF v_job_id IS NOT NULL THEN
    UPDATE generation_jobs
    SET status = 'FAILED', error_text = SQLERRM, updated_at = now()
    WHERE id = v_job_id;
  END IF;
  
  RAISE EXCEPTION 'Hierarchy generation failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;
