-- Atomic Razorpay webhook processing
-- Guarantees event registration + financial mutation + processed status in one DB transaction.

CREATE OR REPLACE FUNCTION public.process_razorpay_webhook_event(
  p_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_correlation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_webhook_id uuid;
  v_order_id text;
  v_payment_id text;
  v_order_row record;
  v_result jsonb := '{}'::jsonb;
BEGIN
  IF p_event_id IS NULL OR btrim(p_event_id) = '' THEN
    RAISE EXCEPTION 'INVALID_EVENT_ID';
  END IF;

  INSERT INTO public.webhook_events (
    event_id,
    event_type,
    payload_json,
    correlation_id,
    received_at,
    processing_status,
    retry_count
  )
  VALUES (
    p_event_id,
    coalesce(nullif(btrim(p_event_type), ''), 'unknown'),
    coalesce(p_payload, '{}'::jsonb),
    p_correlation_id,
    now(),
    'received',
    0
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_webhook_id;

  IF v_webhook_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true
    );
  END IF;

  UPDATE public.webhook_events
  SET processing_status = 'processing'
  WHERE id = v_webhook_id;

  IF p_event_type = 'payment.captured' THEN
    v_order_id := p_payload #>> '{payload,payment,entity,order_id}';
    v_payment_id := p_payload #>> '{payload,payment,entity,id}';

    IF v_order_id IS NOT NULL AND btrim(v_order_id) <> '' THEN
      UPDATE public.razorpay_orders
      SET status = 'paid',
          paid_at = now(),
          payment_id = COALESCE(NULLIF(v_payment_id, ''), payment_id)
      WHERE order_id = v_order_id
        AND status <> 'paid'
      RETURNING * INTO v_order_row;

      IF v_order_row IS NULL THEN
        v_result := jsonb_build_object(
          'topup', jsonb_build_object(
            'alreadyProcessed', true,
            'orderId', v_order_id
          )
        );
      END IF;
    END IF;
  END IF;

  UPDATE public.webhook_events
  SET processing_status = 'processed',
      processed_at = now(),
      error_message = NULL
  WHERE id = v_webhook_id;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'event_id', p_event_id,
    'event_type', coalesce(nullif(btrim(p_event_type), ''), 'unknown'),
    'result', v_result
  );
END;
$$;
