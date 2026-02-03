-- Fix: company_subscriptions.status uses enum subscription_status which expects lowercase.
-- Add uppercase values (ACTIVE, TRIAL, etc.) so existing code works without changes.
-- Run each ALTER separately; IF NOT EXISTS prevents errors if value already exists.

ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'TRIAL';
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'EXPIRED';
