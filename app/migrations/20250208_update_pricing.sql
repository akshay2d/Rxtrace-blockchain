-- ============================================================================
-- UPDATE SUBSCRIPTION PLAN PRICING
-- Execute this SQL in Supabase SQL Editor to fix outdated prices
-- ============================================================================

-- Update Starter Monthly price
UPDATE subscription_plans
SET base_price = 9999.00, razorpay_plan_id = 'plan_SCHJ4KWhWuzb9g', updated_at = NOW()
WHERE name = 'Starter' AND billing_cycle = 'monthly';

-- Update Starter Yearly price
UPDATE subscription_plans
SET base_price = 99990.00, razorpay_plan_id = 'plan_SCHNUbYBnmP1QR', updated_at = NOW()
WHERE name = 'Starter' AND billing_cycle = 'yearly';

-- Update Growth Monthly price
UPDATE subscription_plans
SET base_price = 29999.00, razorpay_plan_id = 'plan_SCHRNa8EdD9AmA', updated_at = NOW()
WHERE name = 'Growth' AND billing_cycle = 'monthly';

-- Update Growth Yearly price
UPDATE subscription_plans
SET base_price = 299990.00, razorpay_plan_id = 'plan_SCHceE35czbjr3', updated_at = NOW()
WHERE name = 'Growth' AND billing_cycle = 'yearly';

-- ============================================================================
-- VERIFY THE UPDATE
-- ============================================================================
SELECT name, billing_cycle, base_price, razorpay_plan_id, updated_at
FROM subscription_plans
WHERE name IN ('Starter', 'Growth')
ORDER BY name, billing_cycle;
