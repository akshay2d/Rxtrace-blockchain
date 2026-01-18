-- =====================================================
-- PRODUCTION FIXES - COMPLETE MIGRATION
-- Fixes: Type Mismatch, Missing Columns, Constraints, Indexes, RLS
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- PART 1: FIX TYPE MISMATCH (user_id UUID -> TEXT)
-- =====================================================

-- Step 1.1: Drop all RLS policies that depend on user_id columns
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop ALL policies on all tables that might reference user_id
  FOR r IN (
    SELECT schemaname, tablename, policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename IN (
      'companies', 'seats', 'audit_logs', 'scan_logs', 'labels_units', 
      'boxes', 'cartons', 'pallets', 'company_wallets', 'company_active_heads', 
      'billing_transactions', 'user_profiles', 'skus', 'generation_jobs',
      'billing_usage', 'handsets', 'handset_tokens'
    )
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I CASCADE', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Step 1.2: Drop foreign key constraints on user_id columns
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname, conrelid::regclass::text as table_name
    FROM pg_constraint
    WHERE conname LIKE '%user_id%fkey'
    AND conrelid::regclass::text IN ('companies', 'seats', 'user_profiles')
  ) LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.conname);
  END LOOP;
END $$;

-- Step 1.3: Convert user_id columns from UUID to TEXT
DO $$
BEGIN
  -- Convert companies.user_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'companies' 
    AND column_name = 'user_id'
    AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.companies ALTER COLUMN user_id TYPE TEXT USING user_id::text;
    RAISE NOTICE 'Converted companies.user_id from UUID to TEXT';
  END IF;
  
  -- Convert seats.user_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'seats' 
    AND column_name = 'user_id'
    AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.seats ALTER COLUMN user_id TYPE TEXT USING user_id::text;
    RAISE NOTICE 'Converted seats.user_id from UUID to TEXT';
  END IF;
  
  -- Convert user_profiles.id (if it's UUID)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'user_profiles' 
    AND column_name = 'id'
    AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.user_profiles ALTER COLUMN id TYPE TEXT USING id::text;
    RAISE NOTICE 'Converted user_profiles.id from UUID to TEXT';
  END IF;
END $$;

-- =====================================================
-- PART 2: ENSURE COMPANIES TABLE HAS ALL REQUIRED COLUMNS
-- =====================================================

-- Step 2.1: Create companies table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2.2: Add all required columns
ALTER TABLE public.companies 
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
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS extra_user_seats INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_erp_integrations INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS razorpay_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_plan_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_updated_at TIMESTAMPTZ;

-- Step 2.3: Add check constraints
DO $$
BEGIN
  -- Firm type check
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_firm_type_check'
  ) THEN
    ALTER TABLE public.companies
    ADD CONSTRAINT companies_firm_type_check 
    CHECK (firm_type IS NULL OR firm_type IN ('proprietorship', 'partnership', 'llp', 'pvt_ltd', 'ltd'));
  END IF;
  
  -- Business category check
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_business_category_check'
  ) THEN
    ALTER TABLE public.companies
    ADD CONSTRAINT companies_business_category_check 
    CHECK (business_category IS NULL OR business_category IN ('pharma', 'food', 'dairy', 'logistics'));
  END IF;
  
  -- Business type check
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_business_type_check'
  ) THEN
    ALTER TABLE public.companies
    ADD CONSTRAINT companies_business_type_check 
    CHECK (business_type IS NULL OR business_type IN ('manufacturer', 'exporter', 'distributor', 'wholesaler'));
  END IF;
  
  -- Subscription status check
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_subscription_status_check'
  ) THEN
    ALTER TABLE public.companies DROP CONSTRAINT companies_subscription_status_check;
  END IF;
  
  ALTER TABLE public.companies
  ADD CONSTRAINT companies_subscription_status_check 
  CHECK (subscription_status IS NULL OR subscription_status IN ('trial', 'trialing', 'active', 'paid', 'live', 'past_due', 'expired', 'cancelled'));
END $$;

-- Step 2.4: Add unique constraints
DO $$
BEGIN
  -- One company per user
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_user_id_unique'
  ) THEN
    ALTER TABLE public.companies
    ADD CONSTRAINT companies_user_id_unique UNIQUE (user_id);
  END IF;
  
  -- Unique company name (case-insensitive)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_companies_name_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_companies_name_unique 
    ON public.companies(LOWER(TRIM(company_name)));
  END IF;
END $$;

-- Step 2.5: Add indexes
CREATE INDEX IF NOT EXISTS idx_companies_user_id ON public.companies(user_id);
CREATE INDEX IF NOT EXISTS idx_companies_subscription_status ON public.companies(subscription_status);
CREATE INDEX IF NOT EXISTS idx_companies_trial_end_date ON public.companies(trial_end_date);
CREATE INDEX IF NOT EXISTS idx_companies_email ON public.companies(email);
CREATE INDEX IF NOT EXISTS idx_companies_pan ON public.companies(pan) WHERE pan IS NOT NULL;

-- =====================================================
-- PART 3: ENSURE SEATS TABLE HAS ALL REQUIRED COLUMNS
-- =====================================================

-- Step 3.1: Create seats table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.seats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  user_id TEXT,
  email TEXT,
  role TEXT DEFAULT 'operator',
  active BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'pending',
  invited_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3.2: Add foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'seats_company_id_fkey'
  ) THEN
    ALTER TABLE public.seats
    ADD CONSTRAINT seats_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Step 3.3: Add check constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'seats_role_check'
  ) THEN
    ALTER TABLE public.seats
    ADD CONSTRAINT seats_role_check 
    CHECK (role IS NULL OR role IN ('admin', 'operator', 'viewer'));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'seats_status_check'
  ) THEN
    ALTER TABLE public.seats
    ADD CONSTRAINT seats_status_check 
    CHECK (status IN ('pending', 'active', 'inactive', 'revoked'));
  END IF;
END $$;

-- Step 3.4: Add indexes
CREATE INDEX IF NOT EXISTS idx_seats_company_id ON public.seats(company_id);
CREATE INDEX IF NOT EXISTS idx_seats_user_id ON public.seats(user_id);
CREATE INDEX IF NOT EXISTS idx_seats_email ON public.seats(email);
CREATE INDEX IF NOT EXISTS idx_seats_status ON public.seats(status);
CREATE INDEX IF NOT EXISTS idx_seats_active ON public.seats(active);

-- Step 3.5: Add unique constraint (one active seat per email per company)
CREATE UNIQUE INDEX IF NOT EXISTS idx_seats_company_email_unique 
ON public.seats(company_id, email) 
WHERE status IN ('active', 'pending') AND email IS NOT NULL;

-- =====================================================
-- PART 4: ENSURE LABELS_UNITS TABLE HAS ALL REQUIRED COLUMNS
-- =====================================================

-- Step 4.1: Create labels_units table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.labels_units (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  sku_id UUID,
  gtin TEXT NOT NULL,
  batch TEXT NOT NULL,
  mfd TEXT NOT NULL,
  expiry TEXT NOT NULL,
  mrp DECIMAL(10,2),
  serial TEXT NOT NULL,
  gs1_payload TEXT NOT NULL,  -- ⭐ CRITICAL: Required for scan validation
  box_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 4.2: Add foreign key constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'labels_units_company_id_fkey'
  ) THEN
    ALTER TABLE public.labels_units
    ADD CONSTRAINT labels_units_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
  
  -- Note: sku_id and box_id foreign keys will be added after those tables are created
END $$;

-- Step 4.3: Add uniqueness constraint (CRITICAL for GS1 compliance)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'labels_units_unique_company_gtin_batch_serial'
  ) THEN
    ALTER TABLE public.labels_units
    ADD CONSTRAINT labels_units_unique_company_gtin_batch_serial
    UNIQUE (company_id, gtin, batch, serial);
    RAISE NOTICE 'Added uniqueness constraint on labels_units(company_id, gtin, batch, serial)';
  END IF;
END $$;

-- Step 4.4: Ensure box_id column exists (may not exist if table was created earlier)
ALTER TABLE public.labels_units ADD COLUMN IF NOT EXISTS box_id UUID;

-- Step 4.5: Add indexes
CREATE INDEX IF NOT EXISTS idx_labels_units_company_serial ON public.labels_units(company_id, serial);
CREATE INDEX IF NOT EXISTS idx_labels_units_company_gtin_batch ON public.labels_units(company_id, gtin, batch);

-- Only create box_id index if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'labels_units' 
    AND column_name = 'box_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_labels_units_box_id ON public.labels_units(box_id) WHERE box_id IS NOT NULL;
  END IF;
END $$;

-- =====================================================
-- PART 5: ENSURE BOXES, CARTONS, PALLETS TABLES EXIST
-- =====================================================

-- Step 5.1: Create boxes table
CREATE TABLE IF NOT EXISTS public.boxes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  sku_id UUID,
  sscc TEXT,
  sscc_with_ai TEXT,
  code TEXT,
  carton_id UUID,
  pallet_id UUID,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign keys for boxes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'boxes_company_id_fkey'
  ) THEN
    ALTER TABLE public.boxes
    ADD CONSTRAINT boxes_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure all columns exist before creating indexes
ALTER TABLE public.boxes 
  ADD COLUMN IF NOT EXISTS sku_id UUID,
  ADD COLUMN IF NOT EXISTS sscc TEXT,
  ADD COLUMN IF NOT EXISTS sscc_with_ai TEXT,
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS carton_id UUID,
  ADD COLUMN IF NOT EXISTS pallet_id UUID,
  ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_boxes_company_id ON public.boxes(company_id);

-- Create indexes only if columns exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'sscc') THEN
    CREATE INDEX IF NOT EXISTS idx_boxes_sscc ON public.boxes(sscc) WHERE sscc IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'carton_id') THEN
    CREATE INDEX IF NOT EXISTS idx_boxes_carton_id ON public.boxes(carton_id) WHERE carton_id IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'boxes' AND column_name = 'pallet_id') THEN
    CREATE INDEX IF NOT EXISTS idx_boxes_pallet_id ON public.boxes(pallet_id) WHERE pallet_id IS NOT NULL;
  END IF;
END $$;

-- Step 5.2: Create cartons table
CREATE TABLE IF NOT EXISTS public.cartons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  pallet_id UUID,
  code TEXT,
  sscc TEXT,
  sscc_with_ai TEXT,
  sku_id UUID,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign keys for cartons
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cartons_company_id_fkey'
  ) THEN
    ALTER TABLE public.cartons
    ADD CONSTRAINT cartons_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure all columns exist before creating indexes
ALTER TABLE public.cartons 
  ADD COLUMN IF NOT EXISTS pallet_id UUID,
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS sscc TEXT,
  ADD COLUMN IF NOT EXISTS sscc_with_ai TEXT,
  ADD COLUMN IF NOT EXISTS sku_id UUID,
  ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_cartons_company_id ON public.cartons(company_id);

-- Create indexes only if columns exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cartons' AND column_name = 'sscc') THEN
    CREATE INDEX IF NOT EXISTS idx_cartons_sscc ON public.cartons(sscc) WHERE sscc IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cartons' AND column_name = 'pallet_id') THEN
    CREATE INDEX IF NOT EXISTS idx_cartons_pallet_id ON public.cartons(pallet_id) WHERE pallet_id IS NOT NULL;
  END IF;
END $$;

-- Step 5.3: Create pallets table
CREATE TABLE IF NOT EXISTS public.pallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  sku_id UUID,
  sscc TEXT,
  sscc_with_ai TEXT,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign keys for pallets
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pallets_company_id_fkey'
  ) THEN
    ALTER TABLE public.pallets
    ADD CONSTRAINT pallets_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure all columns exist before creating indexes
ALTER TABLE public.pallets 
  ADD COLUMN IF NOT EXISTS sku_id UUID,
  ADD COLUMN IF NOT EXISTS sscc TEXT,
  ADD COLUMN IF NOT EXISTS sscc_with_ai TEXT,
  ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}';

-- Add unique constraint on sscc if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.pallets'::regclass 
    AND conname LIKE '%sscc%unique%'
  ) THEN
    -- Try to add unique constraint, but only if column exists and has no duplicates
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pallets' AND column_name = 'sscc') THEN
      BEGIN
        CREATE UNIQUE INDEX IF NOT EXISTS idx_pallets_sscc_unique ON public.pallets(sscc) WHERE sscc IS NOT NULL;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not create unique index on pallets.sscc (may have duplicates)';
      END;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pallets_company_id ON public.pallets(company_id);

-- Create indexes only if columns exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pallets' AND column_name = 'sscc') THEN
    CREATE INDEX IF NOT EXISTS idx_pallets_sscc ON public.pallets(sscc) WHERE sscc IS NOT NULL;
  END IF;
END $$;

-- Step 5.4: Add cross-references between boxes, cartons, pallets
DO $$
BEGIN
  -- boxes.carton_id -> cartons.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'boxes_carton_id_fkey'
  ) THEN
    ALTER TABLE public.boxes
    ADD CONSTRAINT boxes_carton_id_fkey 
    FOREIGN KEY (carton_id) REFERENCES public.cartons(id) ON DELETE SET NULL;
  END IF;
  
  -- boxes.pallet_id -> pallets.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'boxes_pallet_id_fkey'
  ) THEN
    ALTER TABLE public.boxes
    ADD CONSTRAINT boxes_pallet_id_fkey 
    FOREIGN KEY (pallet_id) REFERENCES public.pallets(id) ON DELETE SET NULL;
  END IF;
  
  -- cartons.pallet_id -> pallets.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cartons_pallet_id_fkey'
  ) THEN
    ALTER TABLE public.cartons
    ADD CONSTRAINT cartons_pallet_id_fkey 
    FOREIGN KEY (pallet_id) REFERENCES public.pallets(id) ON DELETE SET NULL;
  END IF;
  
  -- labels_units.box_id -> boxes.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'labels_units_box_id_fkey'
  ) THEN
    ALTER TABLE public.labels_units
    ADD CONSTRAINT labels_units_box_id_fkey 
    FOREIGN KEY (box_id) REFERENCES public.boxes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =====================================================
-- PART 6: ENSURE SUPPORTING TABLES EXIST
-- =====================================================

-- Step 6.1: user_profiles
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id TEXT PRIMARY KEY,  -- Matches auth.users.id (as TEXT)
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);

-- Step 6.2: otp_verifications
CREATE TABLE IF NOT EXISTS public.otp_verifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  otp TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_email ON public.otp_verifications(email);
CREATE INDEX IF NOT EXISTS idx_otp_verified ON public.otp_verifications(verified);
CREATE INDEX IF NOT EXISTS idx_otp_expires_at ON public.otp_verifications(expires_at);

-- Step 6.3: billing_usage
CREATE TABLE IF NOT EXISTS public.billing_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  billing_period_start TIMESTAMPTZ NOT NULL,
  billing_period_end TIMESTAMPTZ NOT NULL,
  plan TEXT NOT NULL,
  unit_labels_quota INTEGER DEFAULT 0,
  box_labels_quota INTEGER DEFAULT 0,
  carton_labels_quota INTEGER DEFAULT 0,
  pallet_labels_quota INTEGER DEFAULT 0,
  user_seats_quota INTEGER DEFAULT 1,
  unit_labels_used INTEGER DEFAULT 0,
  box_labels_used INTEGER DEFAULT 0,
  carton_labels_used INTEGER DEFAULT 0,
  pallet_labels_used INTEGER DEFAULT 0,
  user_seats_used INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_usage_company_id_fkey'
  ) THEN
    ALTER TABLE public.billing_usage
    ADD CONSTRAINT billing_usage_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_usage_company_period_unique'
  ) THEN
    ALTER TABLE public.billing_usage
    ADD CONSTRAINT billing_usage_company_period_unique
    UNIQUE (company_id, billing_period_start);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_billing_usage_company_id ON public.billing_usage(company_id);
CREATE INDEX IF NOT EXISTS idx_billing_usage_period ON public.billing_usage(billing_period_start, billing_period_end);

-- Step 6.4: scan_logs
CREATE TABLE IF NOT EXISTS public.scan_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  handset_id UUID,
  raw_scan TEXT NOT NULL,
  parsed JSONB,
  metadata JSONB DEFAULT '{}',
  status TEXT,
  code_id UUID,
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure company_id column exists before adding foreign key
-- If column doesn't exist, add it (nullable first, then we can set NOT NULL if needed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'scan_logs' 
    AND column_name = 'company_id'
  ) THEN
    ALTER TABLE public.scan_logs ADD COLUMN company_id UUID;
    RAISE NOTICE 'Added company_id column to scan_logs';
  END IF;
END $$;

DO $$
BEGIN
  -- Only add foreign key if company_id column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'scan_logs' 
    AND column_name = 'company_id'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'scan_logs_company_id_fkey'
    ) THEN
      ALTER TABLE public.scan_logs
      ADD CONSTRAINT scan_logs_company_id_fkey 
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
      RAISE NOTICE 'Added foreign key constraint on scan_logs.company_id';
    END IF;
  ELSE
    RAISE NOTICE 'WARNING: scan_logs.company_id column does not exist, skipping foreign key';
  END IF;
END $$;

-- Ensure all columns exist before creating indexes
ALTER TABLE public.scan_logs 
  ADD COLUMN IF NOT EXISTS handset_id UUID,
  ADD COLUMN IF NOT EXISTS parsed JSONB,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS code_id UUID,
  ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_scan_logs_company_id ON public.scan_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_scanned_at ON public.scan_logs(scanned_at DESC);

-- Create indexes only if columns exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'scan_logs' AND column_name = 'handset_id') THEN
    CREATE INDEX IF NOT EXISTS idx_scan_logs_handset_id ON public.scan_logs(handset_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'scan_logs' AND column_name = 'status') THEN
    CREATE INDEX IF NOT EXISTS idx_scan_logs_status ON public.scan_logs(status);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'scan_logs' AND column_name = 'code_id') THEN
    CREATE INDEX IF NOT EXISTS idx_scan_logs_code_id ON public.scan_logs(code_id) WHERE code_id IS NOT NULL;
  END IF;
END $$;

-- Step 6.5: audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  integration_system TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_company_id_fkey'
  ) THEN
    ALTER TABLE public.audit_logs
    ADD CONSTRAINT audit_logs_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id ON public.audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- Step 6.6: company_wallets
CREATE TABLE IF NOT EXISTS public.company_wallets (
  company_id UUID PRIMARY KEY,
  balance DECIMAL(10,2) DEFAULT 0,
  credit_limit DECIMAL(10,2) DEFAULT 10000,
  status TEXT DEFAULT 'ACTIVE',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_wallets_company_id_fkey'
  ) THEN
    ALTER TABLE public.company_wallets
    ADD CONSTRAINT company_wallets_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Step 6.7: company_active_heads
CREATE TABLE IF NOT EXISTS public.company_active_heads (
  company_id UUID PRIMARY KEY,
  heads JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_active_heads_company_id_fkey'
  ) THEN
    ALTER TABLE public.company_active_heads
    ADD CONSTRAINT company_active_heads_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Step 6.8: billing_transactions
CREATE TABLE IF NOT EXISTS public.billing_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  type TEXT NOT NULL,
  subtype TEXT,
  count INTEGER DEFAULT 1,
  amount DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_transactions_company_id_fkey'
  ) THEN
    ALTER TABLE public.billing_transactions
    ADD CONSTRAINT billing_transactions_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_billing_transactions_company_id ON public.billing_transactions(company_id);

-- Step 6.9: skus (if not exists)
CREATE TABLE IF NOT EXISTS public.skus (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  sku_code TEXT NOT NULL,
  sku_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'skus_company_id_fkey'
  ) THEN
    ALTER TABLE public.skus
    ADD CONSTRAINT skus_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'skus_company_sku_unique'
  ) THEN
    ALTER TABLE public.skus
    ADD CONSTRAINT skus_company_sku_unique
    UNIQUE (company_id, sku_code);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_skus_company_id ON public.skus(company_id);
CREATE INDEX IF NOT EXISTS idx_skus_company_deleted ON public.skus(company_id, deleted_at) WHERE deleted_at IS NULL;

-- Add foreign key from labels_units to skus
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'labels_units_sku_id_fkey'
  ) THEN
    ALTER TABLE public.labels_units
    ADD CONSTRAINT labels_units_sku_id_fkey 
    FOREIGN KEY (sku_id) REFERENCES public.skus(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =====================================================
-- PART 7: ENABLE RLS AND CREATE POLICIES (Type-Safe)
-- =====================================================

-- Step 7.1: Enable RLS on all tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labels_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cartons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_active_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_usage ENABLE ROW LEVEL SECURITY;

-- Step 7.2: Create RLS policies for companies (with TEXT casting)
DROP POLICY IF EXISTS "Users can view own company" ON public.companies;
CREATE POLICY "Users can view own company" ON public.companies
  FOR SELECT
  USING (user_id::text = auth.uid()::text);

DROP POLICY IF EXISTS "Users can update own company" ON public.companies;
CREATE POLICY "Users can update own company" ON public.companies
  FOR UPDATE
  USING (user_id::text = auth.uid()::text);

DROP POLICY IF EXISTS "Service role full access companies" ON public.companies;
CREATE POLICY "Service role full access companies" ON public.companies
  FOR ALL
  USING (auth.role() = 'service_role');

-- Step 7.3: Create RLS policies for seats
DROP POLICY IF EXISTS "Users can view own seat" ON public.seats;
CREATE POLICY "Users can view own seat" ON public.seats
  FOR SELECT
  USING (user_id::text = auth.uid()::text OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can view company seats" ON public.seats;
CREATE POLICY "Users can view company seats" ON public.seats
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats 
      WHERE user_id::text = auth.uid()::text AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Service role full access seats" ON public.seats;
CREATE POLICY "Service role full access seats" ON public.seats
  FOR ALL
  USING (auth.role() = 'service_role');

-- Step 7.4: Create RLS policies for labels_units
DROP POLICY IF EXISTS "Users can view own company labels_units" ON public.labels_units;
CREATE POLICY "Users can view own company labels_units" ON public.labels_units
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats
      WHERE user_id::text = auth.uid()::text AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can insert own company labels_units" ON public.labels_units;
CREATE POLICY "Users can insert own company labels_units" ON public.labels_units
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats
      WHERE user_id::text = auth.uid()::text AND status = 'active' AND role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Service role full access labels_units" ON public.labels_units;
CREATE POLICY "Service role full access labels_units" ON public.labels_units
  FOR ALL
  USING (auth.role() = 'service_role');

-- Step 7.5: Create RLS policies for boxes, cartons, pallets
DROP POLICY IF EXISTS "Users can view own company boxes" ON public.boxes;
CREATE POLICY "Users can view own company boxes" ON public.boxes
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats
      WHERE user_id::text = auth.uid()::text AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can manage own company boxes" ON public.boxes;
CREATE POLICY "Users can manage own company boxes" ON public.boxes
  FOR ALL
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats
      WHERE user_id::text = auth.uid()::text AND status = 'active' AND role IN ('admin', 'manager')
    )
  );

-- Similar policies for cartons and pallets
DROP POLICY IF EXISTS "Users can view own company cartons" ON public.cartons;
CREATE POLICY "Users can view own company cartons" ON public.cartons
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats
      WHERE user_id::text = auth.uid()::text AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can manage own company cartons" ON public.cartons;
CREATE POLICY "Users can manage own company cartons" ON public.cartons
  FOR ALL
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats
      WHERE user_id::text = auth.uid()::text AND status = 'active' AND role IN ('admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Users can view own company pallets" ON public.pallets;
CREATE POLICY "Users can view own company pallets" ON public.pallets
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats
      WHERE user_id::text = auth.uid()::text AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can manage own company pallets" ON public.pallets;
CREATE POLICY "Users can manage own company pallets" ON public.pallets
  FOR ALL
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats
      WHERE user_id::text = auth.uid()::text AND status = 'active' AND role IN ('admin', 'manager')
    )
  );

-- Step 7.6: Create RLS policies for scan_logs and audit_logs
DROP POLICY IF EXISTS "Users can view own company scan_logs" ON public.scan_logs;
CREATE POLICY "Users can view own company scan_logs" ON public.scan_logs
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats
      WHERE user_id::text = auth.uid()::text AND status = 'active'
    )
  );

DROP POLICY IF EXISTS "Users can view own company audit_logs" ON public.audit_logs;
CREATE POLICY "Users can view own company audit_logs" ON public.audit_logs
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats
      WHERE user_id::text = auth.uid()::text AND status = 'active'
    )
  );

-- Step 7.7: Create RLS policies for supporting tables
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT
  USING (id::text = auth.uid()::text);

DROP POLICY IF EXISTS "Users can view own company wallet" ON public.company_wallets;
CREATE POLICY "Users can view own company wallet" ON public.company_wallets
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats
      WHERE user_id::text = auth.uid()::text AND status = 'active' AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can view own company heads" ON public.company_active_heads;
CREATE POLICY "Users can view own company heads" ON public.company_active_heads
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats
      WHERE user_id::text = auth.uid()::text AND status = 'active' AND role IN ('admin')
    )
  );

DROP POLICY IF EXISTS "Users can view own company billing_transactions" ON public.billing_transactions;
CREATE POLICY "Users can view own company billing_transactions" ON public.billing_transactions
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats
      WHERE user_id::text = auth.uid()::text AND status = 'active' AND role IN ('admin')
    )
  );

DROP POLICY IF EXISTS "Users can view own company billing_usage" ON public.billing_usage;
CREATE POLICY "Users can view own company billing_usage" ON public.billing_usage
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats
      WHERE user_id::text = auth.uid()::text AND status = 'active' AND role IN ('admin')
    )
  );

DROP POLICY IF EXISTS "Users can view own company SKUs" ON public.skus;
CREATE POLICY "Users can view own company SKUs" ON public.skus
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id::text = auth.uid()::text
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats
      WHERE user_id::text = auth.uid()::text AND status = 'active'
    )
  );

-- Service role policies for all tables
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOR table_name IN 
    SELECT unnest(ARRAY[
      'seats', 'labels_units', 'boxes', 'cartons', 'pallets', 'skus',
      'scan_logs', 'audit_logs', 'company_wallets', 'company_active_heads',
      'billing_transactions', 'user_profiles', 'billing_usage'
    ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Service role full access %s" ON public.%I', table_name, table_name);
    EXECUTE format('CREATE POLICY "Service role full access %s" ON public.%I FOR ALL USING (auth.role() = ''service_role'')', table_name, table_name);
  END LOOP;
END $$;

-- =====================================================
-- PART 8: VERIFICATION QUERIES (Run these to test)
-- =====================================================

-- Uncomment and run these queries to verify the migration:

/*
-- Verify user_id columns are TEXT
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('companies', 'seats', 'user_profiles')
AND column_name IN ('user_id', 'id')
ORDER BY table_name, column_name;

-- Verify uniqueness constraint on labels_units
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = 'public.labels_units'::regclass
AND conname = 'labels_units_unique_company_gtin_batch_serial';

-- Verify gs1_payload column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'labels_units'
AND column_name = 'gs1_payload';

-- Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public'
AND tablename IN ('companies', 'seats', 'labels_units', 'boxes', 'cartons', 'pallets')
ORDER BY tablename;

-- Verify indexes exist
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public'
AND tablename IN ('companies', 'seats', 'labels_units')
ORDER BY tablename, indexname;

-- Test RLS policy (should return rows if user is authenticated)
-- Replace 'YOUR_USER_ID' with actual user ID
SELECT id, company_name 
FROM public.companies 
WHERE user_id::text = 'YOUR_USER_ID'::text;
*/

-- =====================================================
-- END OF MIGRATION
-- =====================================================
