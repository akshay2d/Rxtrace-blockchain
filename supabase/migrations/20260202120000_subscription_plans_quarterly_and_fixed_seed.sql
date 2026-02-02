-- Option 2: Allow quarterly billing_cycle and seed 6 fixed plans (Starter Monthly/Yearly, Growth Monthly/Yearly, Enterprise Monthly/Quarterly).

-- 1. Allow 'quarterly' in subscription_plans.billing_cycle
DO $$
DECLARE
  conname text;
BEGIN
  SELECT tc.constraint_name INTO conname
  FROM information_schema.table_constraints tc
  JOIN information_schema.check_constraints cc ON cc.constraint_name = tc.constraint_name AND cc.constraint_schema = tc.table_schema
  WHERE tc.table_schema = 'public' AND tc.table_name = 'subscription_plans'
    AND tc.constraint_type = 'CHECK' AND cc.check_clause LIKE '%billing_cycle%'
  LIMIT 1;
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.subscription_plans DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE public.subscription_plans
  ADD CONSTRAINT subscription_plans_billing_cycle_check
  CHECK (billing_cycle IN ('monthly', 'yearly', 'quarterly'));

-- 2. Seed 6 fixed plans by (name, billing_cycle); skip if already present
INSERT INTO subscription_plans (name, description, billing_cycle, base_price, display_order, is_active)
SELECT 'Starter Monthly', 'Perfect for small businesses', 'monthly', 18000.00, 1, true
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Starter Monthly' AND billing_cycle = 'monthly');

INSERT INTO subscription_plans (name, description, billing_cycle, base_price, display_order, is_active)
SELECT 'Starter Yearly', 'Perfect for small businesses', 'yearly', 200000.00, 2, true
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Starter Yearly' AND billing_cycle = 'yearly');

INSERT INTO subscription_plans (name, description, billing_cycle, base_price, display_order, is_active)
SELECT 'Growth Monthly', 'Most popular plan', 'monthly', 49000.00, 3, true
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Growth Monthly' AND billing_cycle = 'monthly');

INSERT INTO subscription_plans (name, description, billing_cycle, base_price, display_order, is_active)
SELECT 'Growth Yearly', 'Most popular plan', 'yearly', 500000.00, 4, true
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Growth Yearly' AND billing_cycle = 'yearly');

INSERT INTO subscription_plans (name, description, billing_cycle, base_price, display_order, is_active)
SELECT 'Enterprise Monthly', 'For large enterprises', 'monthly', 200000.00, 5, true
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Enterprise Monthly' AND billing_cycle = 'monthly');

INSERT INTO subscription_plans (name, description, billing_cycle, base_price, display_order, is_active)
SELECT 'Enterprise Quarterly', 'For large enterprises', 'quarterly', 600000.00, 6, true
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Enterprise Quarterly' AND billing_cycle = 'quarterly');
