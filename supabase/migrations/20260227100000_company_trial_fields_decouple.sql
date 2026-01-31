-- FIX 1+2: Trial at company level only. No trial in company_subscriptions.
-- companies: trial_started_at, trial_ends_at, trial_status (active | expired | converted)

ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_status TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_trial_status_check') THEN
    ALTER TABLE companies ADD CONSTRAINT companies_trial_status_check
      CHECK (trial_status IS NULL OR trial_status IN ('active', 'expired', 'converted'));
  END IF;
END $$;

COMMENT ON COLUMN companies.trial_started_at IS 'Trial start (company-level). Trial is separate from subscription.';
COMMENT ON COLUMN companies.trial_ends_at IS 'Trial end (company-level).';
COMMENT ON COLUMN companies.trial_status IS 'active = on trial; expired = trial ended; converted = user subscribed.';

-- Backfill: from existing trial rows in company_subscriptions into companies
UPDATE companies c
SET
  trial_started_at = COALESCE(c.trial_started_at, sub.created_at, NOW()),
  trial_ends_at = COALESCE(c.trial_ends_at, sub.trial_end, sub.current_period_end, NOW() + INTERVAL '15 days'),
  trial_status = CASE
    WHEN (sub.trial_end IS NOT NULL AND (sub.trial_end)::timestamptz > NOW()) THEN 'active'
    WHEN (sub.current_period_end IS NOT NULL AND (sub.current_period_end)::timestamptz > NOW()) THEN 'active'
    ELSE 'expired'
  END
FROM company_subscriptions sub
WHERE sub.company_id = c.id
  AND (sub.status)::text IN ('TRIAL', 'trialing');

-- Remove trial rows from company_subscriptions (subscriptions = paid only)
DELETE FROM company_subscriptions WHERE (status)::text IN ('TRIAL', 'trialing');
