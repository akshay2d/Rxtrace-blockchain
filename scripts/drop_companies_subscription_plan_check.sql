-- Run this in Supabase Dashboard → SQL Editor (on the SAME project your app uses).
-- Drops companies_subscription_plan_check so subscription_plan can accept our 6 plan names.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'companies_subscription_plan_check'
  ) THEN
    ALTER TABLE companies DROP CONSTRAINT companies_subscription_plan_check;
    RAISE NOTICE 'Dropped companies_subscription_plan_check';
  ELSE
    RAISE NOTICE 'Constraint companies_subscription_plan_check does not exist';
  END IF;
END $$;
