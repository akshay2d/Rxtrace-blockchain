-- Trial separate from subscription. Trial = company_trials only. Subscription = company_subscriptions only.

CREATE TABLE IF NOT EXISTS company_trials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  trial_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trial_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id)
);

CREATE INDEX IF NOT EXISTS idx_company_trials_company ON company_trials(company_id);
CREATE INDEX IF NOT EXISTS idx_company_trials_trial_end ON company_trials(trial_end);

COMMENT ON TABLE company_trials IS 'Trial period per company. Separate from subscriptions. When trial ends, user selects plan and subscribes (company_subscriptions).';

-- Backfill: copy existing trial rows from company_subscriptions into company_trials (one per company)
INSERT INTO company_trials (company_id, trial_start, trial_end, created_at, updated_at)
SELECT
  company_id,
  COALESCE(created_at, NOW()),
  COALESCE(trial_end, current_period_end, NOW() + INTERVAL '15 days'),
  COALESCE(created_at, NOW()),
  COALESCE(updated_at, NOW())
FROM company_subscriptions
WHERE (is_trial = true OR status IN ('TRIAL', 'trialing'))
  AND company_id NOT IN (SELECT company_id FROM company_trials)
ON CONFLICT (company_id) DO NOTHING;
