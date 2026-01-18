-- =====================================================
-- PRIORITY 2: PRE-SCALE REQUIREMENTS
-- Performance indexes, audit logging, scan history
-- =====================================================

-- 1. ENSURE SCAN_LOGS TABLE EXISTS
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

-- Performance indexes for scan_logs
CREATE INDEX IF NOT EXISTS idx_scan_logs_company_id ON scan_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_handset_id ON scan_logs(handset_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_scanned_at ON scan_logs(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_logs_code_id ON scan_logs(code_id) WHERE code_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scan_logs_status ON scan_logs(status);
CREATE INDEX IF NOT EXISTS idx_scan_logs_parsed_serial ON scan_logs USING GIN ((parsed->>'serialNo'));
CREATE INDEX IF NOT EXISTS idx_scan_logs_parsed_sscc ON scan_logs USING GIN ((parsed->>'sscc'));

-- RLS for scan_logs
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

-- 2. ENSURE AUDIT_LOGS TABLE EXISTS (if not already created)
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

-- Performance indexes for audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id ON audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_action ON audit_logs(company_id, action);

-- RLS for audit_logs (if not already enabled)
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

-- 3. ADDITIONAL PERFORMANCE INDEXES FOR EXISTING TABLES

-- Billing transactions indexes
CREATE INDEX IF NOT EXISTS idx_billing_transactions_company_created ON billing_transactions(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_transactions_type ON billing_transactions(type, subtype);

-- Company wallets indexes
CREATE INDEX IF NOT EXISTS idx_company_wallets_status ON company_wallets(status) WHERE status != 'ACTIVE';

-- Seats indexes (if not exists)
CREATE INDEX IF NOT EXISTS idx_seats_company_active ON seats(company_id, active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_seats_company_status ON seats(company_id, status);

-- Handsets indexes
CREATE INDEX IF NOT EXISTS idx_handsets_company_status ON handsets(company_id, status);
CREATE INDEX IF NOT EXISTS idx_handsets_device_fingerprint ON handsets(device_fingerprint);

-- Packing rules indexes
CREATE INDEX IF NOT EXISTS idx_packing_rules_company_sku ON packing_rules(company_id, sku_id);

-- 4. PREVENT DUPLICATE COMPANY CREATION BY PAN/GST
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_pan_unique 
ON companies(pan) WHERE pan IS NOT NULL AND pan != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_gst_unique 
ON companies(gst) WHERE gst IS NOT NULL AND gst != '';

-- 5. ENSURE USER_PROFILES TABLE EXISTS FOR AUTH LINKING
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

-- 6. ENSURE COMPANY_WALLETS TABLE EXISTS
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

-- 7. ENSURE COMPANY_ACTIVE_HEADS TABLE EXISTS
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

-- 8. ENSURE BILLING_TRANSACTIONS TABLE EXISTS
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
