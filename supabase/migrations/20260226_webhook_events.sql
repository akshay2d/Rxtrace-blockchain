-- Create webhook_events table for idempotency tracking and audit
-- Phase 1: Critical Database Schema Fixes
-- Task 1.1: webhook_events table migration

-- Drop existing function if exists (for idempotent migration)
DROP FUNCTION IF EXISTS insert_webhook_event(TEXT, TEXT, TEXT, TEXT, JSONB);

-- Create webhook_events table
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL,
    event_type TEXT NOT NULL,
    entity_id TEXT,
    entity_type TEXT,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add unique constraint on idempotency_key
-- Use a separate DROP CONSTRAINT if exists pattern for compatibility
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'webhook_events_idempotency_key_unique'
    ) THEN
        ALTER TABLE webhook_events 
            ADD CONSTRAINT webhook_events_idempotency_key_unique 
            UNIQUE (idempotency_key);
    END IF;
END $$;

-- Index for idempotency lookups (critical for deduplication)
CREATE INDEX IF NOT EXISTS idx_webhook_events_idempotency 
ON webhook_events(idempotency_key) 
WHERE processing_status IN ('pending', 'processing', 'completed');

-- Index for entity lookups (for debugging and reconciliation)
CREATE INDEX IF NOT EXISTS idx_webhook_events_entity 
ON webhook_events(entity_type, entity_id);

-- Index for event type filtering
CREATE INDEX IF NOT EXISTS idx_webhook_events_type 
ON webhook_events(event_type, created_at DESC);

-- Index for processing status (for retry jobs)
CREATE INDEX IF NOT EXISTS idx_webhook_events_status 
ON webhook_events(processing_status, retry_count) 
WHERE processing_status IN ('pending', 'failed');

-- Index for created_at (for cleanup jobs)
CREATE INDEX IF NOT EXISTS idx_webhook_events_created 
ON webhook_events(created_at DESC);

-- Function to safely insert webhook event with idempotency
-- Returns: event_id (UUID), is_duplicate (boolean), was_inserted (boolean)
CREATE OR REPLACE FUNCTION insert_webhook_event(
    p_idempotency_key TEXT,
    p_event_type TEXT,
    p_entity_id TEXT,
    p_entity_type TEXT,
    p_payload JSONB
) RETURNS TABLE(event_id UUID, is_duplicate BOOLEAN, was_inserted BOOLEAN) AS $$
DECLARE
    v_event_id UUID;
    v_exists BOOLEAN;
BEGIN
    -- Check if event already exists with completed or processing status
    SELECT EXISTS(
        SELECT 1 FROM webhook_events 
        WHERE idempotency_key = p_idempotency_key
        AND processing_status IN ('completed', 'processing')
    ) INTO v_exists;
    
    IF v_exists THEN
        -- Return existing event as duplicate
        SELECT id, true, false 
        INTO event_id, is_duplicate, was_inserted
        FROM webhook_events 
        WHERE idempotency_key = p_idempotency_key
        AND processing_status IN ('completed', 'processing')
        LIMIT 1;
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Insert new event with processing status
    INSERT INTO webhook_events (
        idempotency_key,
        event_type,
        entity_id,
        entity_type,
        payload,
        processing_status
    ) VALUES (
        p_idempotency_key,
        p_event_type,
        p_entity_id,
        p_entity_type,
        p_payload,
        'processing'
    )
    RETURNING id INTO v_event_id;
    
    RETURN QUERY SELECT v_event_id, false, true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark webhook event as completed
CREATE OR REPLACE FUNCTION mark_webhook_event_completed(
    p_event_id UUID
) RETURNS VOID AS $$
BEGIN
    UPDATE webhook_events
    SET 
        processing_status = 'completed',
        processed_at = NOW(),
        retry_count = retry_count
    WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark webhook event as failed
CREATE OR REPLACE FUNCTION mark_webhook_event_failed(
    p_event_id UUID,
    p_error_message TEXT
) RETURNS VOID AS $$
BEGIN
    UPDATE webhook_events
    SET 
        processing_status = 'failed',
        error_message = p_error_message,
        retry_count = retry_count + 1
    WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute on functions to service role (adjust as needed)
-- GRANT EXECUTE ON FUNCTION insert_webhook_event(TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;
-- GRANT EXECUTE ON FUNCTION mark_webhook_event_completed(UUID) TO service_role;
-- GRANT EXECUTE ON FUNCTION mark_webhook_event_failed(UUID, TEXT) TO service_role;

-- Comments for documentation
COMMENT ON TABLE webhook_events IS 'Stores Razorpay webhook events for idempotency tracking and audit';
COMMENT ON COLUMN webhook_events.idempotency_key IS 'Unique key from Razorpay webhook (event+entity+timestamp combination)';
COMMENT ON COLUMN webhook_events.event_type IS 'Type of Razorpay event (payment.success, subscription.created, etc.)';
COMMENT ON COLUMN webhook_events.entity_id IS 'ID of the entity (payment_id, subscription_id, etc.)';
COMMENT ON COLUMN webhook_events.entity_type IS 'Type of entity (payment, subscription, invoice)';
COMMENT ON COLUMN webhook_events.processing_status IS 'Status of event processing: pending, processing, completed, failed, skipped';
COMMENT ON FUNCTION insert_webhook_event IS 'Safely inserts webhook event, returns duplicate flag for idempotency';
