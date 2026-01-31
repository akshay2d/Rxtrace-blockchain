-- Phase 6: Store tax, discount, and billing cycle on invoices for compliant invoicing
ALTER TABLE IF EXISTS public.billing_invoices
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 4),
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS has_gst BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_number TEXT,
  ADD COLUMN IF NOT EXISTS discount_type TEXT CHECK (discount_type IS NULL OR discount_type IN ('percentage', 'flat')),
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly', 'yearly', 'quarterly'));

-- Phase 1: Indexes for reporting (plan: idx_invoices_has_gst, idx_invoices_billing_cycle → billing_invoices)
CREATE INDEX IF NOT EXISTS idx_billing_invoices_has_gst ON public.billing_invoices(has_gst) WHERE has_gst = true;
CREATE INDEX IF NOT EXISTS idx_billing_invoices_billing_cycle ON public.billing_invoices(billing_cycle);

COMMENT ON COLUMN public.billing_invoices.tax_rate IS 'GST rate applied (e.g. 0.18 for 18%)';
COMMENT ON COLUMN public.billing_invoices.tax_amount IS 'Tax amount in INR';
COMMENT ON COLUMN public.billing_invoices.has_gst IS 'Whether GST was applied (company had valid GST number)';
COMMENT ON COLUMN public.billing_invoices.gst_number IS 'Company GST number at time of invoice';
COMMENT ON COLUMN public.billing_invoices.discount_type IS 'Discount type: percentage or flat';
COMMENT ON COLUMN public.billing_invoices.discount_value IS 'Discount value (percentage or flat amount)';
COMMENT ON COLUMN public.billing_invoices.discount_amount IS 'Discount amount applied in INR';
COMMENT ON COLUMN public.billing_invoices.billing_cycle IS 'Billing cycle: monthly, yearly, or quarterly';
