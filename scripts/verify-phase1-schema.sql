-- Phase 1 verification: billing_invoices has tax, discount, billing_cycle columns and indexes
-- (Plan references "invoices"; this codebase uses public.billing_invoices for subscription/addon invoices.)

-- 1. Verify columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'billing_invoices'
  AND column_name IN ('tax_rate', 'tax_amount', 'has_gst', 'gst_number',
                      'discount_type', 'discount_value', 'discount_amount', 'billing_cycle')
ORDER BY column_name;

-- 2. Verify indexes (Phase 1)
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'billing_invoices'
  AND (indexname = 'idx_billing_invoices_has_gst' OR indexname = 'idx_billing_invoices_billing_cycle');

-- 3. Existing rows unaffected (columns nullable; no NOT NULL added)
SELECT COUNT(*) AS total_invoices FROM public.billing_invoices;
