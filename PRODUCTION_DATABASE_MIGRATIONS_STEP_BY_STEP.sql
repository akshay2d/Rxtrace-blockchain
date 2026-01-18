-- =====================================================
-- PRODUCTION DATABASE MIGRATIONS - STEP BY STEP
-- Run each section separately to identify errors
-- =====================================================

-- =====================================================
-- STEP 0: FIX TYPE MISMATCHES (Run this first!)
-- =====================================================
-- Ensure user_id columns are TEXT type to match auth.uid()::text comparisons
-- First drop all policies that depend on user_id, then convert types, then recreate policies
DO $$
BEGIN
  -- Drop ALL policies on companies table (using CASCADE to drop dependent policies)
  DROP POLICY IF EXISTS "Users can view own company" ON companies CASCADE;
  DROP POLICY IF EXISTS "Users can update own company" ON companies CASCADE;
  DROP POLICY IF EXISTS "Service role full access companies" ON companies CASCADE;
  
  -- Drop all policies that might reference companies.user_id
  -- Try all possible policy names
  DROP POLICY IF EXISTS "Users can view own company audit_logs" ON audit_logs CASCADE;
  DROP POLICY IF EXISTS "Companies can view own audit logs" ON audit_logs CASCADE;
  DROP POLICY IF EXISTS "Users can view own company scan_logs" ON scan_logs CASCADE;
  DROP POLICY IF EXISTS "Users can view own company labels_units" ON labels_units CASCADE;
  DROP POLICY IF EXISTS "Users can insert own company labels_units" ON labels_units CASCADE;
  DROP POLICY IF EXISTS "Users can view own company boxes" ON boxes CASCADE;
  DROP POLICY IF EXISTS "Users can manage own company boxes" ON boxes CASCADE;
  DROP POLICY IF EXISTS "Users can view own company cartons" ON cartons CASCADE;
  DROP POLICY IF EXISTS "Users can manage own company cartons" ON cartons CASCADE;
  DROP POLICY IF EXISTS "Users can view own company pallets" ON pallets CASCADE;
  DROP POLICY IF EXISTS "Users can manage own company pallets" ON pallets CASCADE;
  DROP POLICY IF EXISTS "Users can view own company wallet" ON company_wallets CASCADE;
  DROP POLICY IF EXISTS "Users can view own company heads" ON company_active_heads CASCADE;
  DROP POLICY IF EXISTS "Users can view own company billing_transactions" ON billing_transactions CASCADE;
  
  -- Drop ALL policies on audit_logs, scan_logs, and other tables that might reference user_id
  -- This is a more aggressive approach to ensure all dependent policies are dropped
  -- Note: We do this in a separate DO block
END $$;

-- Drop all policies that might reference user_id (separate DO block)
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop all policies on audit_logs
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_logs') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON audit_logs CASCADE', r.policyname);
  END LOOP;
  
  -- Drop all policies on scan_logs
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scan_logs') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON scan_logs CASCADE', r.policyname);
  END LOOP;
  
  -- Drop all policies on labels_units
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'labels_units') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON labels_units CASCADE', r.policyname);
  END LOOP;
  
  -- Drop all policies on boxes
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'boxes') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON boxes CASCADE', r.policyname);
  END LOOP;
  
  -- Drop all policies on cartons
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cartons') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON cartons CASCADE', r.policyname);
  END LOOP;
  
  -- Drop all policies on pallets
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pallets') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON pallets CASCADE', r.policyname);
  END LOOP;
  
  -- Drop all policies on company_wallets
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'company_wallets') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON company_wallets CASCADE', r.policyname);
  END LOOP;
  
  -- Drop all policies on company_active_heads
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'company_active_heads') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON company_active_heads CASCADE', r.policyname);
  END LOOP;
  
  -- Drop all policies on billing_transactions
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'billing_transactions') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON billing_transactions CASCADE', r.policyname);
  END LOOP;
  
  -- Drop all policies on seats (important - has user_id column)
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'seats') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON seats CASCADE', r.policyname);
  END LOOP;
  
  -- Drop all policies on companies (important - has user_id column)
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON companies CASCADE', r.policyname);
  END LOOP;
END $$;

-- Now convert the column types
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop foreign key constraints on user_id columns first
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'companies_user_id_fkey'
  ) THEN
    ALTER TABLE companies DROP CONSTRAINT companies_user_id_fkey;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'seats_user_id_fkey'
  ) THEN
    ALTER TABLE seats DROP CONSTRAINT seats_user_id_fkey;
  END IF;
  
  -- Also check for any other foreign key constraints on user_id
  FOR r IN (
    SELECT conname, conrelid::regclass::text as table_name
    FROM pg_constraint
    WHERE conname LIKE '%user_id%fkey'
    AND conrelid::regclass::text IN ('companies', 'seats')
  ) LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.conname);
  END LOOP;
  
  -- Convert companies.user_id from UUID to TEXT if needed
  -- Note: If conversion fails due to dependencies, we'll handle it by casting in comparisons
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'companies' 
      AND column_name = 'user_id'
      AND data_type = 'uuid'
    ) THEN
      ALTER TABLE companies ALTER COLUMN user_id TYPE TEXT USING user_id::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- If conversion fails, we'll rely on casting in comparisons
    RAISE NOTICE 'Could not convert companies.user_id to TEXT, will use casts in comparisons';
  END;
  
  -- Convert seats.user_id from UUID to TEXT if needed
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'seats' 
      AND column_name = 'user_id'
      AND data_type = 'uuid'
    ) THEN
      ALTER TABLE seats ALTER COLUMN user_id TYPE TEXT USING user_id::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- If conversion fails, we'll rely on casting in comparisons
    RAISE NOTICE 'Could not convert seats.user_id to TEXT, will use casts in comparisons';
  END;
END $$;

-- =====================================================
-- STEP 1: CREATE COMPANIES TABLE (if not exists)
-- =====================================================
CREATE TABLE IF NOT EXISTS companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- STEP 2: ADD COLUMNS TO COMPANIES TABLE
-- =====================================================
ALTER TABLE companies 
  ADD COLUMN IF NOT EXISTS contact_person_name TEXT,
  ADD COLUMN IF NOT EXISTS firm_type TEXT,
  ADD COLUMN IF NOT EXISTS business_category TEXT,
  ADD COLUMN IF NOT EXISTS business_type TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT,
  ADD COLUMN IF NOT EXISTS trial_start_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pan TEXT,
  ADD COLUMN IF NOT EXISTS gst TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT;

-- =====================================================
-- STEP 3: ADD CHECK CONSTRAINTS TO COMPANIES
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'companies_firm_type_check'
  ) THEN
    ALTER TABLE companies
    ADD CONSTRAINT companies_firm_type_check 
    CHECK (firm_type IS NULL OR firm_type IN ('proprietorship', 'partnership', 'llp', 'pvt_ltd', 'ltd'));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'companies_business_category_check'
  ) THEN
    ALTER TABLE companies
    ADD CONSTRAINT companies_business_category_check 
    CHECK (business_category IS NULL OR business_category IN ('pharma', 'food', 'dairy', 'logistics'));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'companies_business_type_check'
  ) THEN
    ALTER TABLE companies
    ADD CONSTRAINT companies_business_type_check 
    CHECK (business_type IS NULL OR business_type IN ('manufacturer', 'exporter', 'distributor', 'wholesaler'));
  END IF;
END $$;

-- =====================================================
-- STEP 4: ADD UNIQUE CONSTRAINT ON USER_ID
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'companies_user_id_unique'
  ) THEN
    ALTER TABLE companies
    ADD CONSTRAINT companies_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

-- =====================================================
-- STEP 5: CREATE INDEXES ON COMPANIES TABLE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_companies_user_id ON companies(user_id);
CREATE INDEX IF NOT EXISTS idx_companies_subscription_status ON companies(subscription_status) WHERE subscription_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_trial_end_date ON companies(trial_end_date) WHERE trial_end_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_email ON companies(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_pan ON companies(pan) WHERE pan IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_gst ON companies(gst) WHERE gst IS NOT NULL;

-- =====================================================
-- STEP 6: CREATE LABELS_UNITS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS labels_units (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku_id UUID,
  gtin TEXT NOT NULL,
  batch TEXT NOT NULL,
  mfd TEXT NOT NULL,
  expiry TEXT NOT NULL,
  mrp DECIMAL(10,2),
  serial TEXT NOT NULL,
  gs1_payload TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- STEP 7: ADD FOREIGN KEY FOR SKU_ID IN LABELS_UNITS
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skus') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'labels_units_sku_id_fkey'
    ) THEN
      ALTER TABLE labels_units 
      ADD CONSTRAINT labels_units_sku_id_fkey 
      FOREIGN KEY (sku_id) REFERENCES skus(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- =====================================================
-- STEP 8: ADD UNIQUENESS CONSTRAINT ON LABELS_UNITS
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'labels_units_unique_company_gtin_batch_serial'
  ) THEN
    ALTER TABLE labels_units
    ADD CONSTRAINT labels_units_unique_company_gtin_batch_serial
    UNIQUE (company_id, gtin, batch, serial);
  END IF;
END $$;

-- =====================================================
-- STEP 9: CREATE INDEXES ON LABELS_UNITS
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_labels_units_company_id ON labels_units(company_id);
CREATE INDEX IF NOT EXISTS idx_labels_units_company_serial ON labels_units(company_id, serial);
CREATE INDEX IF NOT EXISTS idx_labels_units_company_gtin_batch ON labels_units(company_id, gtin, batch);
CREATE INDEX IF NOT EXISTS idx_labels_units_sku_id ON labels_units(sku_id) WHERE sku_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_labels_units_created_at ON labels_units(created_at DESC);

-- =====================================================
-- STEP 10: CREATE BOXES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS boxes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku_id UUID,
  code TEXT,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- STEP 11: ADD COLUMNS TO BOXES TABLE
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'boxes' AND column_name = 'sku_id'
  ) THEN
    ALTER TABLE boxes ADD COLUMN sku_id UUID;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'boxes' AND column_name = 'sscc'
  ) THEN
    ALTER TABLE boxes ADD COLUMN sscc VARCHAR(18);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'boxes' AND column_name = 'sscc_with_ai'
  ) THEN
    ALTER TABLE boxes ADD COLUMN sscc_with_ai TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'boxes' AND column_name = 'carton_id'
  ) THEN
    ALTER TABLE boxes ADD COLUMN carton_id UUID;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'boxes' AND column_name = 'pallet_id'
  ) THEN
    ALTER TABLE boxes ADD COLUMN pallet_id UUID;
  END IF;
END $$;

-- =====================================================
-- STEP 12: ADD FOREIGN KEYS TO BOXES TABLE
-- =====================================================
DO $$
BEGIN
  -- First ensure sku_id column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'boxes' AND column_name = 'sku_id'
  ) THEN
    ALTER TABLE boxes ADD COLUMN sku_id UUID;
  END IF;
  
  -- Then add foreign key if skus table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skus') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'boxes_sku_id_fkey'
    ) THEN
      ALTER TABLE boxes 
      ADD CONSTRAINT boxes_sku_id_fkey 
      FOREIGN KEY (sku_id) REFERENCES skus(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- =====================================================
-- STEP 13: CREATE INDEXES ON BOXES TABLE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_boxes_company_id ON boxes(company_id);
CREATE INDEX IF NOT EXISTS idx_boxes_carton_id ON boxes(carton_id) WHERE carton_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_boxes_pallet_id ON boxes(pallet_id) WHERE pallet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_boxes_sscc ON boxes(sscc) WHERE sscc IS NOT NULL;

-- =====================================================
-- STEP 14: ADD BOX_ID TO LABELS_UNITS
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'labels_units' AND column_name = 'box_id'
  ) THEN
    ALTER TABLE labels_units ADD COLUMN box_id UUID;
  END IF;
END $$;

-- =====================================================
-- STEP 15: ADD FOREIGN KEY FOR BOX_ID
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'labels_units_box_id_fkey'
  ) THEN
    ALTER TABLE labels_units 
    ADD CONSTRAINT labels_units_box_id_fkey 
    FOREIGN KEY (box_id) REFERENCES boxes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =====================================================
-- STEP 16: CREATE INDEX ON BOX_ID
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_labels_units_box_id ON labels_units(box_id) WHERE box_id IS NOT NULL;

-- =====================================================
-- STEP 17: CREATE CARTONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS cartons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku_id UUID,
  code TEXT,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- STEP 18: ADD COLUMNS TO CARTONS TABLE
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cartons' AND column_name = 'pallet_id'
  ) THEN
    ALTER TABLE cartons ADD COLUMN pallet_id UUID;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cartons' AND column_name = 'sscc'
  ) THEN
    ALTER TABLE cartons ADD COLUMN sscc VARCHAR(18);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cartons' AND column_name = 'sscc_with_ai'
  ) THEN
    ALTER TABLE cartons ADD COLUMN sscc_with_ai TEXT;
  END IF;
END $$;

-- =====================================================
-- STEP 19: CREATE INDEXES ON CARTONS TABLE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_cartons_company_id ON cartons(company_id);
CREATE INDEX IF NOT EXISTS idx_cartons_pallet_id ON cartons(pallet_id) WHERE pallet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cartons_sscc ON cartons(sscc) WHERE sscc IS NOT NULL;

-- =====================================================
-- STEP 20: CREATE PALLETS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS pallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku_id UUID,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- STEP 21: ADD COLUMNS TO PALLETS TABLE
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pallets' AND column_name = 'sscc'
  ) THEN
    ALTER TABLE pallets ADD COLUMN sscc VARCHAR(18) NOT NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pallets' AND column_name = 'sscc_with_ai'
  ) THEN
    ALTER TABLE pallets ADD COLUMN sscc_with_ai TEXT;
  END IF;
END $$;

-- =====================================================
-- STEP 22: CREATE INDEXES ON PALLETS TABLE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_pallets_company_id ON pallets(company_id);
CREATE INDEX IF NOT EXISTS idx_pallets_sscc ON pallets(sscc);
CREATE INDEX IF NOT EXISTS idx_pallets_sku_id ON pallets(sku_id) WHERE sku_id IS NOT NULL;

-- =====================================================
-- STEP 23: ADD FOREIGN KEYS FOR CARTONS AND BOXES
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cartons') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'boxes_carton_id_fkey'
    ) THEN
      ALTER TABLE boxes 
      ADD CONSTRAINT boxes_carton_id_fkey 
      FOREIGN KEY (carton_id) REFERENCES cartons(id) ON DELETE SET NULL;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pallets') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'boxes_pallet_id_fkey'
    ) THEN
      ALTER TABLE boxes 
      ADD CONSTRAINT boxes_pallet_id_fkey 
      FOREIGN KEY (pallet_id) REFERENCES pallets(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'cartons_pallet_id_fkey'
    ) THEN
      ALTER TABLE cartons 
      ADD CONSTRAINT cartons_pallet_id_fkey 
      FOREIGN KEY (pallet_id) REFERENCES pallets(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- =====================================================
-- STEP 24: ENSURE SKUS TABLE HAS UNIQUENESS
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skus') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'skus_company_id_sku_code_key'
    ) THEN
      ALTER TABLE skus
      ADD CONSTRAINT skus_company_id_sku_code_key UNIQUE (company_id, sku_code);
    END IF;
  END IF;
END $$;

-- =====================================================
-- STEP 25: ENABLE ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE labels_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cartons ENABLE ROW LEVEL SECURITY;
ALTER TABLE pallets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skus') THEN
    ALTER TABLE skus ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- =====================================================
-- STEP 26: CREATE RLS POLICIES FOR COMPANIES
-- =====================================================
DROP POLICY IF EXISTS "Users can view own company" ON companies;
CREATE POLICY "Users can view own company" ON companies
  FOR SELECT
  USING (user_id::text = auth.uid()::text);

DROP POLICY IF EXISTS "Users can update own company" ON companies;
CREATE POLICY "Users can update own company" ON companies
  FOR UPDATE
  USING (user_id::text = auth.uid()::text);

DROP POLICY IF EXISTS "Service role full access companies" ON companies;
CREATE POLICY "Service role full access companies" ON companies
  FOR ALL
  USING (auth.role() = 'service_role');

-- =====================================================
-- STEP 27: CREATE RLS POLICIES FOR LABELS_UNITS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own company labels_units" ON labels_units;
CREATE POLICY "Users can view own company labels_units" ON labels_units
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id::text = auth.uid()::text AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can insert own company labels_units" ON labels_units;
CREATE POLICY "Users can insert own company labels_units" ON labels_units
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id::text = auth.uid()::text AND status = 'active' AND role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Service role full access labels_units" ON labels_units;
CREATE POLICY "Service role full access labels_units" ON labels_units
  FOR ALL
  USING (auth.role() = 'service_role');

-- =====================================================
-- STEP 28: CREATE RLS POLICIES FOR BOXES
-- =====================================================
DROP POLICY IF EXISTS "Users can view own company boxes" ON boxes;
CREATE POLICY "Users can view own company boxes" ON boxes
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id::text = auth.uid()::text AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can manage own company boxes" ON boxes;
CREATE POLICY "Users can manage own company boxes" ON boxes
  FOR ALL
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id::text = auth.uid()::text AND status = 'active' AND role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Service role full access boxes" ON boxes;
CREATE POLICY "Service role full access boxes" ON boxes
  FOR ALL
  USING (auth.role() = 'service_role');

-- =====================================================
-- STEP 29: CREATE RLS POLICIES FOR CARTONS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own company cartons" ON cartons;
CREATE POLICY "Users can view own company cartons" ON cartons
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id::text = auth.uid()::text AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can manage own company cartons" ON cartons;
CREATE POLICY "Users can manage own company cartons" ON cartons
  FOR ALL
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id::text = auth.uid()::text AND status = 'active' AND role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Service role full access cartons" ON cartons;
CREATE POLICY "Service role full access cartons" ON cartons
  FOR ALL
  USING (auth.role() = 'service_role');

-- =====================================================
-- STEP 30: CREATE RLS POLICIES FOR PALLETS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own company pallets" ON pallets;
CREATE POLICY "Users can view own company pallets" ON pallets
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id::text = auth.uid()::text AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can manage own company pallets" ON pallets;
CREATE POLICY "Users can manage own company pallets" ON pallets
  FOR ALL
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id::text = auth.uid()::text AND status = 'active' AND role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Service role full access pallets" ON pallets;
CREATE POLICY "Service role full access pallets" ON pallets
  FOR ALL
  USING (auth.role() = 'service_role');

-- =====================================================
-- PRIORITY 2: PRE-SCALE REQUIREMENTS
-- =====================================================

-- =====================================================
-- STEP 31: CREATE SCAN_LOGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS scan_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  raw_scan TEXT NOT NULL,
  parsed JSONB,
  code_id UUID,
  scanner_printer_id TEXT,
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  ip TEXT,
  metadata JSONB DEFAULT '{}'
);

-- =====================================================
-- STEP 32: ADD COMPANY_ID AND HANDSET_ID COLUMNS TO SCAN_LOGS
-- =====================================================
DO $$
BEGIN
  -- Add company_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'scan_logs' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE scan_logs ADD COLUMN company_id UUID;
  END IF;
  
  -- Add foreign key for company_id if companies table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'companies') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'scan_logs_company_id_fkey'
    ) THEN
      ALTER TABLE scan_logs 
      ADD CONSTRAINT scan_logs_company_id_fkey 
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  -- Add handset_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'scan_logs' AND column_name = 'handset_id'
  ) THEN
    ALTER TABLE scan_logs ADD COLUMN handset_id UUID;
  END IF;
  
  -- Add foreign key for handset_id if handsets table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'handsets') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'scan_logs_handset_id_fkey'
    ) THEN
      ALTER TABLE scan_logs 
      ADD CONSTRAINT scan_logs_handset_id_fkey 
      FOREIGN KEY (handset_id) REFERENCES handsets(id) ON DELETE SET NULL;
    END IF;
  END IF;
  
  -- Add status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'scan_logs' AND column_name = 'status'
  ) THEN
    ALTER TABLE scan_logs ADD COLUMN status TEXT DEFAULT 'SUCCESS';
  END IF;
END $$;

-- =====================================================
-- STEP 33: CREATE INDEXES ON SCAN_LOGS
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scan_logs' AND column_name = 'company_id') THEN
    CREATE INDEX IF NOT EXISTS idx_scan_logs_company_id ON scan_logs(company_id) WHERE company_id IS NOT NULL;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scan_logs' AND column_name = 'handset_id') THEN
    CREATE INDEX IF NOT EXISTS idx_scan_logs_handset_id ON scan_logs(handset_id) WHERE handset_id IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_scan_logs_scanned_at ON scan_logs(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_logs_code_id ON scan_logs(code_id) WHERE code_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scan_logs' AND column_name = 'status') THEN
    CREATE INDEX IF NOT EXISTS idx_scan_logs_status ON scan_logs(status);
  END IF;
END $$;

-- =====================================================
-- STEP 34: ENABLE RLS ON SCAN_LOGS
-- =====================================================
ALTER TABLE scan_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 35: CREATE RLS POLICIES FOR SCAN_LOGS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own company scan_logs" ON scan_logs;
CREATE POLICY "Users can view own company scan_logs" ON scan_logs
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id::text = auth.uid()::text AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Service role full access scan_logs" ON scan_logs;
CREATE POLICY "Service role full access scan_logs" ON scan_logs
  FOR ALL
  USING (auth.role() = 'service_role');

-- =====================================================
-- STEP 36: CREATE AUDIT_LOGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  integration_system TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- STEP 37: CREATE INDEXES ON AUDIT_LOGS
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id ON audit_logs(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_action ON audit_logs(company_id, action) WHERE company_id IS NOT NULL;

-- =====================================================
-- STEP 38: ENABLE RLS ON AUDIT_LOGS
-- =====================================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 39: CREATE RLS POLICIES FOR AUDIT_LOGS
-- =====================================================
DROP POLICY IF EXISTS "Users can view own company audit_logs" ON audit_logs;
CREATE POLICY "Users can view own company audit_logs" ON audit_logs
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id::text = auth.uid()::text AND status = 'active' AND role IN ('admin')
    )
  );

DROP POLICY IF EXISTS "Service role full access audit_logs" ON audit_logs;
CREATE POLICY "Service role full access audit_logs" ON audit_logs
  FOR ALL
  USING (auth.role() = 'service_role');

-- =====================================================
-- STEP 40: CREATE ADDITIONAL INDEXES (with column checks)
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'billing_transactions' AND column_name = 'company_id') THEN
    CREATE INDEX IF NOT EXISTS idx_billing_transactions_company_created ON billing_transactions(company_id, created_at DESC);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'billing_transactions') THEN
    CREATE INDEX IF NOT EXISTS idx_billing_transactions_type ON billing_transactions(type, subtype);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'seats' AND column_name = 'company_id') THEN
    CREATE INDEX IF NOT EXISTS idx_seats_company_active ON seats(company_id, active) WHERE active = true;
    CREATE INDEX IF NOT EXISTS idx_seats_company_status ON seats(company_id, status);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'handsets' AND column_name = 'company_id') THEN
    CREATE INDEX IF NOT EXISTS idx_handsets_company_status ON handsets(company_id, status);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'handsets') THEN
    CREATE INDEX IF NOT EXISTS idx_handsets_device_fingerprint ON handsets(device_fingerprint);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'packing_rules' AND column_name = 'company_id') THEN
    CREATE INDEX IF NOT EXISTS idx_packing_rules_company_sku ON packing_rules(company_id, sku_id);
  END IF;
END $$;

-- =====================================================
-- STEP 41: PREVENT DUPLICATE COMPANY BY PAN/GST
-- =====================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_pan_unique 
ON companies(pan) WHERE pan IS NOT NULL AND pan != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_gst_unique 
ON companies(gst) WHERE gst IS NOT NULL AND gst != '';

-- =====================================================
-- STEP 42: CREATE USER_PROFILES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Service role full access user_profiles" ON user_profiles;
CREATE POLICY "Service role full access user_profiles" ON user_profiles
  FOR ALL
  USING (auth.role() = 'service_role');

-- =====================================================
-- STEP 43: CREATE COMPANY_WALLETS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS company_wallets (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  balance DECIMAL(15,2) DEFAULT 0,
  credit_limit DECIMAL(15,2) DEFAULT 10000,
  status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FROZEN', 'SUSPENDED')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_wallets_status ON company_wallets(status);

ALTER TABLE company_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own company wallet" ON company_wallets;
CREATE POLICY "Users can view own company wallet" ON company_wallets
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id::text = auth.uid()::text AND status = 'active' AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Service role full access company_wallets" ON company_wallets;
CREATE POLICY "Service role full access company_wallets" ON company_wallets
  FOR ALL
  USING (auth.role() = 'service_role');

-- =====================================================
-- STEP 44: CREATE COMPANY_ACTIVE_HEADS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS company_active_heads (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  heads JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE company_active_heads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own company heads" ON company_active_heads;
CREATE POLICY "Users can view own company heads" ON company_active_heads
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id::text = auth.uid()::text AND status = 'active' AND role IN ('admin')
    )
  );

DROP POLICY IF EXISTS "Service role full access company_active_heads" ON company_active_heads;
CREATE POLICY "Service role full access company_active_heads" ON company_active_heads
  FOR ALL
  USING (auth.role() = 'service_role');

-- =====================================================
-- STEP 45: CREATE BILLING_TRANSACTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS billing_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  subtype TEXT,
  count INTEGER DEFAULT 1,
  amount DECIMAL(15,2) NOT NULL,
  balance_after DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_transactions_company_id ON billing_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_billing_transactions_created_at ON billing_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_transactions_type_subtype ON billing_transactions(type, subtype);

ALTER TABLE billing_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own company billing_transactions" ON billing_transactions;
CREATE POLICY "Users can view own company billing_transactions" ON billing_transactions
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id::text = auth.uid()::text AND status = 'active' AND role IN ('admin')
    )
  );

DROP POLICY IF EXISTS "Service role full access billing_transactions" ON billing_transactions;
CREATE POLICY "Service role full access billing_transactions" ON billing_transactions
  FOR ALL
  USING (auth.role() = 'service_role');
