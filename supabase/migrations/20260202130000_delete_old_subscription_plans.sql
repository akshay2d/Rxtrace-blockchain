-- Remove old plans (Starter, Growth, Enterprise with short names). Keep only 6 fixed plans.

-- 1. Migrate company_subscriptions from old plan_id to new plan_id
UPDATE company_subscriptions cs
SET plan_id = np.id
FROM subscription_plans op
JOIN subscription_plans np ON (
  (op.name = 'Starter' AND op.billing_cycle = 'monthly' AND np.name = 'Starter Monthly' AND np.billing_cycle = 'monthly')
  OR (op.name = 'Starter' AND op.billing_cycle = 'yearly' AND np.name = 'Starter Yearly' AND np.billing_cycle = 'yearly')
  OR (op.name = 'Growth' AND op.billing_cycle = 'monthly' AND np.name = 'Growth Monthly' AND np.billing_cycle = 'monthly')
  OR (op.name = 'Growth' AND op.billing_cycle = 'yearly' AND np.name = 'Growth Yearly' AND np.billing_cycle = 'yearly')
  OR (op.name = 'Enterprise' AND op.billing_cycle = 'monthly' AND np.name = 'Enterprise Monthly' AND np.billing_cycle = 'monthly')
  OR (op.name = 'Enterprise' AND op.billing_cycle = 'yearly' AND np.name = 'Enterprise Quarterly' AND np.billing_cycle = 'quarterly')
)
WHERE cs.plan_id = op.id
  AND op.name IN ('Starter', 'Growth', 'Enterprise');

-- 2. Delete old plans (plan_items CASCADE automatically)
DELETE FROM subscription_plans
WHERE name IN ('Starter', 'Growth', 'Enterprise')
  AND billing_cycle IN ('monthly', 'yearly');
