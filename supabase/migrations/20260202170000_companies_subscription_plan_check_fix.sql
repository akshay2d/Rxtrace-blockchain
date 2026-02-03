-- Fix: companies.subscription_plan - remove strict check constraint that blocks subscription flow.
-- The real plan source of truth is company_subscriptions (plan_id). companies.subscription_plan
-- is denormalized; a strict CHECK causes repeated failures. Dropping it unblocks updates.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'companies_subscription_plan_check'
  ) THEN
    ALTER TABLE companies DROP CONSTRAINT companies_subscription_plan_check;
  END IF;
END $$;
