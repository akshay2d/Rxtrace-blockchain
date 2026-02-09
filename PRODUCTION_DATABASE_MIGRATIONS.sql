-- ============================================================================
-- PENDING SUBSCRIPTION STATUS MIGRATION
-- Execute these SQL commands in your Supabase SQL Editor
-- ============================================================================

-- Step 1: Add PENDING status to the subscription_status enum type
-- Note: If the type already has PENDING, this will be safely ignored
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'PENDING';

-- Step 2: Add columns for pending payment tracking and activation timestamps
-- These columns are nullable to allow for existing subscriptions

-- pending_payment_id: Stores the Razorpay payment ID that is being awaited
ALTER TABLE company_subscriptions 
ADD COLUMN IF NOT EXISTS pending_payment_id TEXT NULL;

-- subscription_created_at: Timestamp when the subscription was created in PENDING state
ALTER TABLE company_subscriptions 
ADD COLUMN IF NOT EXISTS subscription_created_at TIMESTAMPTZ NULL;

-- subscription_activated_at: Timestamp when the subscription transitioned from PENDING to ACTIVE
ALTER TABLE company_subscriptions 
ADD COLUMN IF NOT EXISTS subscription_activated_at TIMESTAMPTZ NULL;

-- ============================================================================
-- VERIFICATION QUERIES
-- Run these to verify the migration succeeded
-- ============================================================================

-- Check if PENDING was added to the enum
SELECT enumlabel FROM pg_enum WHERE enumtypid = (
  SELECT oid FROM pg_type WHERE typname = 'subscription_status'
) ORDER BY enumlabel;

-- Verify the new columns exist
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'company_subscriptions' 
AND column_name IN ('pending_payment_id', 'subscription_created_at', 'subscription_activated_at')
ORDER BY column_name;

-- ============================================================================
-- SAMPLE USAGE
-- ============================================================================

-- Example: Create a PENDING subscription during upgrade request
-- INSERT INTO company_subscriptions (company_id, plan_id, status, pending_payment_id, subscription_created_at)
-- VALUES ('uuid-here', 'uuid-here', 'PENDING', 'pay_123456', NOW());

-- Example: Activate a PENDING subscription upon payment webhook
-- UPDATE company_subscriptions 
-- SET status = 'ACTIVE', 
--     subscription_activated_at = NOW(),
--     pending_payment_id = NULL
-- WHERE status = 'PENDING' AND pending_payment_id = 'pay_123456';
