-- Billing Invoices
-- Run this in Supabase SQL Editor (or apply via your migrations process)

CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  amount NUMERIC(18, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'DUE',
  paid_at TIMESTAMPTZ,
  charge_tx_id UUID,
  reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Avoid duplicate invoices for the same company+period
CREATE UNIQUE INDEX IF NOT EXISTS uniq_billing_invoices_company_period
  ON public.billing_invoices (company_id, period_start);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_company_id
  ON public.billing_invoices (company_id);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_status
  ON public.billing_invoices (status);

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.billing_invoices_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_billing_invoices_set_updated_at ON public.billing_invoices;
CREATE TRIGGER trg_billing_invoices_set_updated_at
BEFORE UPDATE ON public.billing_invoices
FOR EACH ROW EXECUTE FUNCTION public.billing_invoices_set_updated_at();
