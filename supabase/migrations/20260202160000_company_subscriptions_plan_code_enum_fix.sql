-- Fix: company_subscriptions.plan_code uses enum subscription_plan.
-- Add our 6 fixed plan codes so inserts succeed.

ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'starter_monthly';
ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'starter_yearly';
ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'growth_monthly';
ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'growth_yearly';
ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'enterprise_monthly';
ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'enterprise_quarterly';
