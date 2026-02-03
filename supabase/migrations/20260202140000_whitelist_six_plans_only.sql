-- Phase 1: Whitelist 6 plans only. Delete ALL plans not in the list. Migrate subscriptions first.

-- Step 1: Ensure the 6 fixed plans exist (insert if missing)
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

-- Step 2: Migrate company_subscriptions - point any subscription to a non-whitelist plan toward Starter Monthly
UPDATE company_subscriptions cs
SET plan_id = (SELECT id FROM subscription_plans WHERE name = 'Starter Monthly' AND billing_cycle = 'monthly' LIMIT 1)
WHERE cs.plan_id IN (
  SELECT id FROM subscription_plans
  WHERE (name, billing_cycle) NOT IN (
    ('Starter Monthly', 'monthly'),
    ('Starter Yearly', 'yearly'),
    ('Growth Monthly', 'monthly'),
    ('Growth Yearly', 'yearly'),
    ('Enterprise Monthly', 'monthly'),
    ('Enterprise Quarterly', 'quarterly')
  )
);

-- Step 3: Delete ALL plans not in the whitelist (plan_items CASCADE)
DELETE FROM subscription_plans
WHERE (name, billing_cycle) NOT IN (
  ('Starter Monthly', 'monthly'),
  ('Starter Yearly', 'yearly'),
  ('Growth Monthly', 'monthly'),
  ('Growth Yearly', 'yearly'),
  ('Enterprise Monthly', 'monthly'),
  ('Enterprise Quarterly', 'quarterly')
);
