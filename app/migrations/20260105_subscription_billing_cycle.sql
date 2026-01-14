-- Add a billing cycle marker (monthly vs annual) for subscription billing.
-- Quotas remain monthly; this only affects which Razorpay plan_id we use.

DO $$
DECLARE
  companies_reg regclass;
  full_table text;
BEGIN
  companies_reg := to_regclass('public.companies');
  IF companies_reg IS NULL THEN
    companies_reg := to_regclass('companies');
  END IF;
  IF companies_reg IS NULL THEN
    RAISE EXCEPTION 'companies table not found';
  END IF;

  full_table := companies_reg::text;

  EXECUTE format(
    'ALTER TABLE %s ADD COLUMN IF NOT EXISTS subscription_billing_cycle TEXT NOT NULL DEFAULT ''monthly''',
    full_table
  );
END $$;
