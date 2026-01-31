-- Ensure companies.gst exists for subscription/billing (GST tax). Safe: IF NOT EXISTS.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS gst TEXT;

COMMENT ON COLUMN public.companies.gst IS 'Company GST number for tax on subscriptions/invoices.';
