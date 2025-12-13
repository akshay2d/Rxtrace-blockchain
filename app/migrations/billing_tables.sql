-- Billing Tables Migration
-- Run this in Supabase SQL Editor

-- Company Wallets (Credit System)
CREATE TABLE IF NOT EXISTS public.company_wallets (
  company_id TEXT PRIMARY KEY,
  balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  credit_limit DOUBLE PRECISION NOT NULL DEFAULT 10000,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Active Paid Heads (Modules)
CREATE TABLE IF NOT EXISTS public.company_active_heads (
  company_id TEXT PRIMARY KEY,
  heads JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Billing Transactions (Audit Log)
CREATE TABLE IF NOT EXISTS public.billing_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  type TEXT NOT NULL,
  subtype TEXT,
  count INTEGER NOT NULL DEFAULT 1,
  amount DOUBLE PRECISION NOT NULL,
  balance_after DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_transactions_company_id ON public.billing_transactions(company_id);

-- Handset Allocation (For scanning)
CREATE TABLE IF NOT EXISTS public.company_handsets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  handset_id TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  monthly_fee DOUBLE PRECISION NOT NULL DEFAULT 100
);

CREATE INDEX IF NOT EXISTS idx_company_handsets_company_id ON public.company_handsets(company_id);

-- Seat Allocation (For code generation)
CREATE TABLE IF NOT EXISTS public.company_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  seat_id TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  monthly_fee DOUBLE PRECISION NOT NULL DEFAULT 200
);

CREATE INDEX IF NOT EXISTS idx_company_seats_company_id ON public.company_seats(company_id);

-- Billing Events
CREATE TABLE IF NOT EXISTS public.billing_events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  amount NUMERIC(18, 2) NOT NULL,
  balance_after NUMERIC(18, 2) NOT NULL,
  reference TEXT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_events_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_billing_events_company ON public.billing_events USING btree (company_id);
