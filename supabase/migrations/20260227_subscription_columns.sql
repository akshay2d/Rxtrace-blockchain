-- Add missing columns to company_subscriptions table
-- Phase 1: Critical Database Schema Fixes
-- Task 1.2: Migration to add missing columns to company_subscriptions

-- 1. Add plan_code TEXT column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'company_subscriptions' 
        AND column_name = 'plan_code'
    ) THEN
        ALTER TABLE company_subscriptions ADD COLUMN plan_code TEXT;
        RAISE NOTICE 'Added column: plan_code';
    ELSE
        RAISE NOTICE 'Column plan_code already exists, skipping';
    END IF;
END $$;

-- 2. Add pending_payment_id TEXT column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'company_subscriptions' 
        AND column_name = 'pending_payment_id'
    ) THEN
        ALTER TABLE company_subscriptions ADD COLUMN pending_payment_id TEXT;
        RAISE NOTICE 'Added column: pending_payment_id';
    ELSE
        RAISE NOTICE 'Column pending_payment_id already exists, skipping';
    END IF;
END $$;

-- 3. Add subscription_created_at TIMESTAMPTZ column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'company_subscriptions' 
        AND column_name = 'subscription_created_at'
    ) THEN
        ALTER TABLE company_subscriptions ADD COLUMN subscription_created_at TIMESTAMPTZ;
        RAISE NOTICE 'Added column: subscription_created_at';
    ELSE
        RAISE NOTICE 'Column subscription_created_at already exists, skipping';
    END IF;
END $$;

-- 4. Add subscription_activated_at TIMESTAMPTZ column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'company_subscriptions' 
        AND column_name = 'subscription_activated_at'
    ) THEN
        ALTER TABLE company_subscriptions ADD COLUMN subscription_activated_at TIMESTAMPTZ;
        RAISE NOTICE 'Added column: subscription_activated_at';
    ELSE
        RAISE NOTICE 'Column subscription_activated_at already exists, skipping';
    END IF;
END $$;

-- 5. Add is_trial BOOLEAN column (if not already added)
-- First check if column exists and is nullable, then add NOT NULL if needed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'company_subscriptions' 
        AND column_name = 'is_trial'
    ) THEN
        ALTER TABLE company_subscriptions ADD COLUMN is_trial BOOLEAN NOT NULL DEFAULT false;
        RAISE NOTICE 'Added column: is_trial with NOT NULL default false';
    ELSE
        -- Column exists, ensure NOT NULL constraint
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'company_subscriptions' 
            AND column_name = 'is_trial'
            AND is_nullable = 'YES'
        ) THEN
            ALTER TABLE company_subscriptions ALTER COLUMN is_trial SET NOT NULL;
            ALTER TABLE company_subscriptions ALTER COLUMN is_trial SET DEFAULT false;
            RAISE NOTICE 'Updated is_trial column: set NOT NULL and default false';
        END IF;
        
        -- Ensure default value exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'company_subscriptions' 
            AND column_name = 'is_trial'
            AND column_default IS NOT NULL
        ) THEN
            ALTER TABLE company_subscriptions ALTER COLUMN is_trial SET DEFAULT false;
            RAISE NOTICE 'Updated is_trial column: set default false';
        END IF;
    END IF;
END $$;

-- 6. Add pause_end_date TIMESTAMPTZ column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'company_subscriptions' 
        AND column_name = 'pause_end_date'
    ) THEN
        ALTER TABLE company_subscriptions ADD COLUMN pause_end_date TIMESTAMPTZ;
        RAISE NOTICE 'Added column: pause_end_date';
    ELSE
        RAISE NOTICE 'Column pause_end_date already exists, skipping';
    END IF;
END $$;

-- 7. Add grace_period_end TIMESTAMPTZ column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'company_subscriptions' 
        AND column_name = 'grace_period_end'
    ) THEN
        ALTER TABLE company_subscriptions ADD COLUMN grace_period_end TIMESTAMPTZ;
        RAISE NOTICE 'Added column: grace_period_end';
    ELSE
        RAISE NOTICE 'Column grace_period_end already exists, skipping';
    END IF;
END $$;

-- 8. Add razorpay_offer_id TEXT column (for discounts)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'company_subscriptions' 
        AND column_name = 'razorpay_offer_id'
    ) THEN
        ALTER TABLE company_subscriptions ADD COLUMN razorpay_offer_id TEXT;
        RAISE NOTICE 'Added column: razorpay_offer_id';
    ELSE
        RAISE NOTICE 'Column razorpay_offer_id already exists, skipping';
    END IF;
END $$;

-- 9. Add billing_cycle TEXT column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'company_subscriptions' 
        AND column_name = 'billing_cycle'
    ) THEN
        ALTER TABLE company_subscriptions ADD COLUMN billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'yearly', 'quarterly'));
        RAISE NOTICE 'Added column: billing_cycle';
    ELSE
        RAISE NOTICE 'Column billing_cycle already exists, skipping';
    END IF;
END $$;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_company_subscriptions_plan_code 
ON company_subscriptions(plan_code) WHERE plan_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_pending_payment 
ON company_subscriptions(pending_payment_id) WHERE pending_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_pause_end 
ON company_subscriptions(pause_end_date) WHERE pause_end_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_grace_period 
ON company_subscriptions(grace_period_end) WHERE grace_period_end IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_offer 
ON company_subscriptions(razorpay_offer_id) WHERE razorpay_offer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_billing_cycle 
ON company_subscriptions(billing_cycle) WHERE billing_cycle IS NOT NULL;

-- Update existing records: populate plan_code from subscription_plans
DO $$
DECLARE
    v_updated INTEGER := 0;
BEGIN
    UPDATE company_subscriptions cs
    SET plan_code = sp.name
    FROM subscription_plans sp
    WHERE cs.plan_id = sp.id
    AND cs.plan_code IS NULL
    AND cs.plan_id IS NOT NULL;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE 'Updated % records with plan_code from subscription_plans', v_updated;
END $$;

-- Update existing records: populate subscription timestamps from created_at
DO $$
DECLARE
    v_updated INTEGER := 0;
BEGIN
    UPDATE company_subscriptions cs
    SET 
        subscription_created_at = COALESCE(cs.subscription_created_at, cs.created_at),
        subscription_activated_at = COALESCE(cs.subscription_activated_at, cs.created_at)
    WHERE cs.subscription_created_at IS NULL 
    OR cs.subscription_activated_at IS NULL;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE 'Updated % records with subscription timestamps', v_updated;
END $$;

-- Update existing records: populate is_trial based on status
DO $$
DECLARE
    v_updated INTEGER := 0;
BEGIN
    UPDATE company_subscriptions cs
    SET is_trial = true
    WHERE cs.status IN ('TRIAL', 'trialing')
    AND cs.is_trial = false;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE 'Updated % trial records with is_trial=true', v_updated;
END $$;

-- Update existing records: set billing_cycle from subscription_plans
DO $$
DECLARE
    v_updated INTEGER := 0;
BEGIN
    UPDATE company_subscriptions cs
    SET billing_cycle = sp.billing_cycle
    FROM subscription_plans sp
    WHERE cs.plan_id = sp.id
    AND cs.billing_cycle IS NULL
    AND cs.plan_id IS NOT NULL;
    
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE 'Updated % records with billing_cycle', v_updated;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN company_subscriptions.plan_code IS 'Human-readable plan name (e.g., Starter, Growth, Enterprise)';
COMMENT ON COLUMN company_subscriptions.pending_payment_id IS 'Pending payment ID during payment flow';
COMMENT ON COLUMN company_subscriptions.subscription_created_at IS 'When the subscription was initially created';
COMMENT ON COLUMN company_subscriptions.subscription_activated_at IS 'When the subscription became active';
COMMENT ON COLUMN company_subscriptions.is_trial IS 'Whether this is a trial subscription';
COMMENT ON COLUMN company_subscriptions.pause_end_date IS 'When the pause period ends (auto-resume date)';
COMMENT ON COLUMN company_subscriptions.grace_period_end IS 'When the grace period ends after expiration';
COMMENT ON COLUMN company_subscriptions.razorpay_offer_id IS 'Razorpay offer ID used for discount';
COMMENT ON COLUMN company_subscriptions.billing_cycle IS 'Billing cycle: monthly, yearly, or quarterly';
