-- Add PENDING status to subscription_status enum
-- This allows subscriptions to be in a pending state before payment confirmation

-- Add PENDING value to company_subscriptions status enum
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'PENDING';

-- Add pending_payment_id column to track pending payments
-- This stores the Razorpay subscription ID while waiting for payment
ALTER TABLE company_subscriptions
ADD COLUMN IF NOT EXISTS pending_payment_id TEXT NULL;

-- Add subscription_created_at for tracking when subscription was initiated
ALTER TABLE company_subscriptions
ADD COLUMN IF NOT EXISTS subscription_created_at TIMESTAMPTZ NULL;

-- Add subscription_activated_at for tracking when payment was confirmed
ALTER TABLE company_subscriptions
ADD COLUMN IF NOT EXISTS subscription_activated_at TIMESTAMPTZ NULL;

-- NOTE: The companies table uses text/varchar for subscription_status, not an enum
-- So no ALTER TYPE needed for companies table
