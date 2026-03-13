-- Simplify companies table for onboarding identity fields only.
-- Drops legacy billing/trial/quota/printer/discount fields.

DO $$
BEGIN
  -- Rename gst -> gst_number when needed.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'gst'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'gst_number'
  ) THEN
    ALTER TABLE public.companies RENAME COLUMN gst TO gst_number;
  END IF;
END $$;

DO $$
BEGIN
  -- Ensure contact_person exists, then drop legacy contact_person_name.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'contact_person'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN contact_person text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'contact_person_name'
  ) THEN
    UPDATE public.companies
    SET contact_person = COALESCE(NULLIF(contact_person, ''), NULLIF(contact_person_name, ''))
    WHERE contact_person IS NULL OR trim(contact_person) = '';

    ALTER TABLE public.companies DROP COLUMN contact_person_name;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'industry'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN industry text;
  END IF;
END $$;

-- Backfill required fields with safe defaults before enforcing NOT NULL.
UPDATE public.companies
SET contact_person = COALESCE(NULLIF(contact_person, ''), 'unknown')
WHERE contact_person IS NULL OR trim(contact_person) = '';

UPDATE public.companies
SET phone = COALESCE(NULLIF(phone, ''), 'unknown')
WHERE phone IS NULL OR trim(phone) = '';

UPDATE public.companies
SET address = COALESCE(NULLIF(address, ''), 'unknown')
WHERE address IS NULL OR trim(address) = '';

UPDATE public.companies
SET industry = COALESCE(NULLIF(industry, ''), NULLIF(business_category, ''), 'unknown')
WHERE industry IS NULL OR trim(industry) = '';

UPDATE public.companies
SET business_type = COALESCE(NULLIF(business_type, ''), 'unknown')
WHERE business_type IS NULL OR trim(business_type) = '';

-- Drop restrictive constraints tied to legacy enums.
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_business_type_check;
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_business_category_check;
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_firm_type_check;
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_subscription_status_check;
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_subscription_plan_check;
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_trial_status_check;
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_trial_window_check;

-- Enforce required identity columns.
ALTER TABLE public.companies ALTER COLUMN contact_person SET NOT NULL;
ALTER TABLE public.companies ALTER COLUMN phone SET NOT NULL;
ALTER TABLE public.companies ALTER COLUMN address SET NOT NULL;
ALTER TABLE public.companies ALTER COLUMN industry SET NOT NULL;
ALTER TABLE public.companies ALTER COLUMN business_type SET NOT NULL;

-- Drop legacy indexes tied to removed columns.
DROP INDEX IF EXISTS idx_companies_subscription_status;
DROP INDEX IF EXISTS idx_companies_trial_end_date;
DROP INDEX IF EXISTS idx_companies_trial_end_at;
DROP INDEX IF EXISTS idx_companies_trial_started_at;
DROP INDEX IF EXISTS idx_companies_trial_expires_at;
DROP INDEX IF EXISTS idx_companies_email;
DROP INDEX IF EXISTS idx_companies_gst;

-- Drop legacy columns from companies table.
ALTER TABLE public.companies
  DROP COLUMN IF EXISTS printer_type,
  DROP COLUMN IF EXISTS printer_identifier,
  DROP COLUMN IF EXISTS print_format,
  DROP COLUMN IF EXISTS discount_type,
  DROP COLUMN IF EXISTS discount_value,
  DROP COLUMN IF EXISTS discount_notes,
  DROP COLUMN IF EXISTS discount_applies_to,
  DROP COLUMN IF EXISTS unit_quota_balance,
  DROP COLUMN IF EXISTS sscc_quota_balance,
  DROP COLUMN IF EXISTS add_on_unit_balance,
  DROP COLUMN IF EXISTS add_on_sscc_balance,
  DROP COLUMN IF EXISTS labels_limit,
  DROP COLUMN IF EXISTS labels_used,
  DROP COLUMN IF EXISTS trial_started_at,
  DROP COLUMN IF EXISTS trial_expires_at,
  DROP COLUMN IF EXISTS trial_start_date,
  DROP COLUMN IF EXISTS trial_end_date,
  DROP COLUMN IF EXISTS trial_start_at,
  DROP COLUMN IF EXISTS trial_end_at,
  DROP COLUMN IF EXISTS trial_ends_at,
  DROP COLUMN IF EXISTS trial_activated_at,
  DROP COLUMN IF EXISTS trial_activated_payment_id,
  DROP COLUMN IF EXISTS trial_status,
  DROP COLUMN IF EXISTS subscription_plan,
  DROP COLUMN IF EXISTS subscription_status,
  DROP COLUMN IF EXISTS subscription_current_period_end,
  DROP COLUMN IF EXISTS subscription_cancel_at_period_end,
  DROP COLUMN IF EXISTS subscription_cancelled_at,
  DROP COLUMN IF EXISTS razorpay_customer_id,
  DROP COLUMN IF EXISTS razorpay_subscription_id,
  DROP COLUMN IF EXISTS razorpay_subscription_status,
  DROP COLUMN IF EXISTS razorpay_plan_id,
  DROP COLUMN IF EXISTS razorpay_offer_id,
  DROP COLUMN IF EXISTS extra_user_seats,
  DROP COLUMN IF EXISTS email;
