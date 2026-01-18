-- =====================================================
-- PRODUCTION DATABASE MIGRATIONS
-- Priority 1: Go-Live Blockers
-- Priority 2: Pre-Scale Requirements
-- =====================================================

-- =====================================================
-- PRIORITY 1: PRODUCTION GO-LIVE BLOCKERS
-- =====================================================

-- 1. COMPANIES TABLE: Create if not exists, then add required columns
CREATE TABLE IF NOT EXISTS companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add required columns and constraints
ALTER TABLE companies 
  ADD COLUMN IF NOT EXISTS contact_person_name TEXT,
  ADD COLUMN IF NOT EXISTS firm_type TEXT CHECK (firm_type IN ('proprietorship', 'partnership', 'llp', 'pvt_ltd', 'ltd')),
  ADD COLUMN IF NOT EXISTS business_category TEXT CHECK (business_category IN ('pharma', 'food', 'dairy', 'logistics')),
  ADD COLUMN IF NOT EXISTS business_type TEXT CHECK (business_type IN ('manufacturer', 'exporter', 'distributor', 'wholesaler')),
  ADD COLUMN IF NOT EXISTS subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT,
  ADD COLUMN IF NOT EXISTS trial_start_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pan TEXT,
  ADD COLUMN IF NOT EXISTS gst TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Prevent duplicate companies per user
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

-- Company indexes
CREATE INDEX IF NOT EXISTS idx_companies_user_id ON companies(user_id);
CREATE INDEX IF NOT EXISTS idx_companies_subscription_status ON companies(subscription_status);
CREATE INDEX IF NOT EXISTS idx_companies_trial_end_date ON companies(trial_end_date);
CREATE INDEX IF NOT EXISTS idx_companies_email ON companies(email);
CREATE INDEX IF NOT EXISTS idx_companies_pan ON companies(pan) WHERE pan IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_gst ON companies(gst) WHERE gst IS NOT NULL;

-- 2. LABELS_UNITS TABLE: GS1 compliance and uniqueness
CREATE TABLE IF NOT EXISTS labels_units (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku_id UUID REFERENCES skus(id) ON DELETE SET NULL,
  gtin TEXT NOT NULL,
  batch TEXT NOT NULL,
  mfd TEXT NOT NULL,
  expiry TEXT NOT NULL,
  mrp DECIMAL(10,2),
  serial TEXT NOT NULL,
  gs1_payload TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- box_id will be added after boxes table is created (see section 3)

-- GS1 Serial uniqueness per company/GTIN/batch
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

-- Performance indexes (box_id index will be added after column is created)
CREATE INDEX IF NOT EXISTS idx_labels_units_company_id ON labels_units(company_id);
CREATE INDEX IF NOT EXISTS idx_labels_units_company_serial ON labels_units(company_id, serial);
CREATE INDEX IF NOT EXISTS idx_labels_units_company_gtin_batch ON labels_units(company_id, gtin, batch);
CREATE INDEX IF NOT EXISTS idx_labels_units_sku_id ON labels_units(sku_id);
CREATE INDEX IF NOT EXISTS idx_labels_units_created_at ON labels_units(created_at DESC);

-- 3. BOXES TABLE (create before adding foreign key from labels_units)
CREATE TABLE IF NOT EXISTS boxes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku_id UUID REFERENCES skus(id) ON DELETE SET NULL,
  code TEXT,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns if they don't exist (for existing tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'boxes' AND column_name = 'sscc'
  ) THEN
    ALTER TABLE boxes ADD COLUMN sscc VARCHAR(18);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_boxes_sscc_unique ON boxes(sscc) WHERE sscc IS NOT NULL;
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

-- Add foreign key constraints for carton_id and pallet_id after tables are created
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
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_boxes_company_id ON boxes(company_id);
CREATE INDEX IF NOT EXISTS idx_boxes_carton_id ON boxes(carton_id);
CREATE INDEX IF NOT EXISTS idx_boxes_pallet_id ON boxes(pallet_id);
CREATE INDEX IF NOT EXISTS idx_boxes_sscc ON boxes(sscc) WHERE sscc IS NOT NULL;

-- Now add box_id to labels_units after boxes table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'labels_units' AND column_name = 'box_id'
  ) THEN
    ALTER TABLE labels_units ADD COLUMN box_id UUID;
  END IF;
END $$;

-- Add foreign key constraint for box_id
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

-- Add index for box_id after column is created
CREATE INDEX IF NOT EXISTS idx_labels_units_box_id ON labels_units(box_id) WHERE box_id IS NOT NULL;

-- 4. CARTONS TABLE
CREATE TABLE IF NOT EXISTS cartons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku_id UUID REFERENCES skus(id) ON DELETE SET NULL,
  code TEXT,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns if they don't exist (for existing tables)
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
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cartons_sscc_unique ON cartons(sscc) WHERE sscc IS NOT NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'cartons' AND column_name = 'sscc_with_ai'
  ) THEN
    ALTER TABLE cartons ADD COLUMN sscc_with_ai TEXT;
  END IF;
END $$;

-- Add foreign key for pallet_id after pallets table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pallets') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'cartons_pallet_id_fkey'
    ) THEN
      ALTER TABLE cartons 
      ADD CONSTRAINT cartons_pallet_id_fkey 
      FOREIGN KEY (pallet_id) REFERENCES pallets(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cartons_company_id ON cartons(company_id);
CREATE INDEX IF NOT EXISTS idx_cartons_pallet_id ON cartons(pallet_id) WHERE pallet_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cartons_sscc ON cartons(sscc) WHERE sscc IS NOT NULL;

-- 5. PALLETS TABLE
CREATE TABLE IF NOT EXISTS pallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku_id UUID REFERENCES skus(id) ON DELETE SET NULL,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns if they don't exist (for existing tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pallets' AND column_name = 'sscc'
  ) THEN
    ALTER TABLE pallets ADD COLUMN sscc VARCHAR(18) NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pallets_sscc_unique ON pallets(sscc);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pallets' AND column_name = 'sscc_with_ai'
  ) THEN
    ALTER TABLE pallets ADD COLUMN sscc_with_ai TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pallets_company_id ON pallets(company_id);
CREATE INDEX IF NOT EXISTS idx_pallets_sscc ON pallets(sscc);
CREATE INDEX IF NOT EXISTS idx_pallets_sku_id ON pallets(sku_id);

-- 6. SKUS TABLE: Ensure uniqueness
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'skus_company_id_sku_code_key'
  ) THEN
    ALTER TABLE skus
    ADD CONSTRAINT skus_company_id_sku_code_key UNIQUE (company_id, sku_code);
  END IF;
END $$;

-- 7. ENABLE ROW LEVEL SECURITY
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE labels_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cartons ENABLE ROW LEVEL SECURITY;
ALTER TABLE pallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE skus ENABLE ROW LEVEL SECURITY;

-- 8. RLS POLICIES FOR COMPANIES
DROP POLICY IF EXISTS "Users can view own company" ON companies;
CREATE POLICY "Users can view own company" ON companies
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own company" ON companies;
CREATE POLICY "Users can update own company" ON companies
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access companies" ON companies;
CREATE POLICY "Service role full access companies" ON companies
  FOR ALL
  USING (auth.role() = 'service_role');

-- 9. RLS POLICIES FOR LABELS_UNITS
DROP POLICY IF EXISTS "Users can view own company labels_units" ON labels_units;
CREATE POLICY "Users can view own company labels_units" ON labels_units
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can insert own company labels_units" ON labels_units;
CREATE POLICY "Users can insert own company labels_units" ON labels_units
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Service role full access labels_units" ON labels_units;
CREATE POLICY "Service role full access labels_units" ON labels_units
  FOR ALL
  USING (auth.role() = 'service_role');

-- 10. RLS POLICIES FOR BOXES
DROP POLICY IF EXISTS "Users can view own company boxes" ON boxes;
CREATE POLICY "Users can view own company boxes" ON boxes
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can manage own company boxes" ON boxes;
CREATE POLICY "Users can manage own company boxes" ON boxes
  FOR ALL
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Service role full access boxes" ON boxes;
CREATE POLICY "Service role full access boxes" ON boxes
  FOR ALL
  USING (auth.role() = 'service_role');

-- 11. RLS POLICIES FOR CARTONS
DROP POLICY IF EXISTS "Users can view own company cartons" ON cartons;
CREATE POLICY "Users can view own company cartons" ON cartons
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can manage own company cartons" ON cartons;
CREATE POLICY "Users can manage own company cartons" ON cartons
  FOR ALL
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Service role full access cartons" ON cartons;
CREATE POLICY "Service role full access cartons" ON cartons
  FOR ALL
  USING (auth.role() = 'service_role');

-- 12. RLS POLICIES FOR PALLETS
DROP POLICY IF EXISTS "Users can view own company pallets" ON pallets;
CREATE POLICY "Users can view own company pallets" ON pallets
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can manage own company pallets" ON pallets;
CREATE POLICY "Users can manage own company pallets" ON pallets
  FOR ALL
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Service role full access pallets" ON pallets;
CREATE POLICY "Service role full access pallets" ON pallets
  FOR ALL
  USING (auth.role() = 'service_role');

-- =====================================================
-- PRIORITY 2: PRE-SCALE REQUIREMENTS
-- =====================================================

-- 1. SCAN_LOGS TABLE
CREATE TABLE IF NOT EXISTS scan_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  handset_id UUID REFERENCES handsets(id) ON DELETE SET NULL,
  raw_scan TEXT NOT NULL,
  parsed JSONB,
  code_id UUID,
  scanner_printer_id TEXT,
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  ip TEXT,
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'SUCCESS'
);

CREATE INDEX IF NOT EXISTS idx_scan_logs_company_id ON scan_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_handset_id ON scan_logs(handset_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_scanned_at ON scan_logs(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_logs_code_id ON scan_logs(code_id) WHERE code_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scan_logs_status ON scan_logs(status);

ALTER TABLE scan_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own company scan_logs" ON scan_logs;
CREATE POLICY "Users can view own company scan_logs" ON scan_logs
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Service role full access scan_logs" ON scan_logs;
CREATE POLICY "Service role full access scan_logs" ON scan_logs
  FOR ALL
  USING (auth.role() = 'service_role');

-- 2. AUDIT_LOGS TABLE
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

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id ON audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_action ON audit_logs(company_id, action);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own company audit_logs" ON audit_logs;
CREATE POLICY "Users can view own company audit_logs" ON audit_logs
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin')
    )
  );

DROP POLICY IF EXISTS "Service role full access audit_logs" ON audit_logs;
CREATE POLICY "Service role full access audit_logs" ON audit_logs
  FOR ALL
  USING (auth.role() = 'service_role');

-- 3. ADDITIONAL PERFORMANCE INDEXES (only if columns exist)
DO $$
BEGIN
  -- billing_transactions indexes
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'billing_transactions' AND column_name = 'company_id') THEN
    CREATE INDEX IF NOT EXISTS idx_billing_transactions_company_created ON billing_transactions(company_id, created_at DESC);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'billing_transactions') THEN
    CREATE INDEX IF NOT EXISTS idx_billing_transactions_type ON billing_transactions(type, subtype);
  END IF;
  
  -- seats indexes
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'seats' AND column_name = 'company_id') THEN
    CREATE INDEX IF NOT EXISTS idx_seats_company_active ON seats(company_id, active) WHERE active = true;
    CREATE INDEX IF NOT EXISTS idx_seats_company_status ON seats(company_id, status);
  END IF;
  
  -- handsets indexes
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'handsets' AND column_name = 'company_id') THEN
    CREATE INDEX IF NOT EXISTS idx_handsets_company_status ON handsets(company_id, status);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'handsets') THEN
    CREATE INDEX IF NOT EXISTS idx_handsets_device_fingerprint ON handsets(device_fingerprint);
  END IF;
  
  -- packing_rules indexes
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'packing_rules' AND column_name = 'company_id') THEN
    CREATE INDEX IF NOT EXISTS idx_packing_rules_company_sku ON packing_rules(company_id, sku_id);
  END IF;
END $$;

-- 4. PREVENT DUPLICATE COMPANY BY PAN/GST
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_pan_unique 
ON companies(pan) WHERE pan IS NOT NULL AND pan != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_gst_unique 
ON companies(gst) WHERE gst IS NOT NULL AND gst != '';

-- 5. USER_PROFILES TABLE
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

-- 6. COMPANY_WALLETS TABLE
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
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Service role full access company_wallets" ON company_wallets;
CREATE POLICY "Service role full access company_wallets" ON company_wallets
  FOR ALL
  USING (auth.role() = 'service_role');

-- 7. COMPANY_ACTIVE_HEADS TABLE
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
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin')
    )
  );

DROP POLICY IF EXISTS "Service role full access company_active_heads" ON company_active_heads;
CREATE POLICY "Service role full access company_active_heads" ON company_active_heads
  FOR ALL
  USING (auth.role() = 'service_role');

-- 8. BILLING_TRANSACTIONS TABLE
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
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM seats 
      WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin')
    )
  );

DROP POLICY IF EXISTS "Service role full access billing_transactions" ON billing_transactions;
CREATE POLICY "Service role full access billing_transactions" ON billing_transactions
  FOR ALL
  USING (auth.role() = 'service_role');
