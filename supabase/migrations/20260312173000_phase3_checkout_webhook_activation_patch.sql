-- Phase 3: Razorpay checkout-session activation patch
-- - Activates subscription + add-ons from checkout_sessions on payment webhook
-- - Keeps webhook event idempotency and avoids duplicate quota application
-- - Aligns subscription states with Phase-2 status model

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
  v_payment_amount_paise bigint;

  v_company_id uuid;
  v_checkout_session record;
  v_checkout_session_id uuid;
  v_existing_subscription_id uuid;

  v_subscription_id text;
  v_subscription_event text;
  v_subscription_status text;
  v_subscription_entity jsonb;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_billing_cycle text;
  v_invoice_id text;
  v_invoice_entity jsonb;
  v_invoice_status text;
  v_invoice_paid_at timestamptz;
  v_invoice_pdf_url text;

  v_plan_template_id uuid;
  v_plan_version_id uuid;
  v_plan_unit int := 0;
  v_plan_box int := 0;
  v_plan_carton int := 0;
  v_plan_pallet int := 0;
  v_plan_seat int := 0;
  v_plan_plant int := 0;
  v_plan_handset int := 0;
  v_total_amount_inr numeric := 0;
  v_total_amount_paise bigint := 0;

  v_result jsonb := '{}'::jsonb;
  v_now timestamptz := now();
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
    v_now,
    'received',
    0
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_webhook_id;

  IF v_webhook_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true);
  END IF;

  UPDATE public.webhook_events
  SET processing_status = 'processing'
  WHERE id = v_webhook_id;

  -- =========================================================
  -- Subscription lifecycle events (backward compatible mapping)
  -- =========================================================
  IF p_event_type LIKE 'subscription.%' THEN
    v_subscription_id := p_payload #>> '{payload,subscription,entity,id}';
    v_subscription_entity := coalesce(p_payload #> '{payload,subscription,entity}', '{}'::jsonb);
    v_subscription_event := lower(coalesce(nullif(split_part(p_event_type, '.', 2), ''), 'unknown'));

    v_subscription_status := CASE v_subscription_event
      WHEN 'authenticated' THEN 'pending'
      WHEN 'activated' THEN 'active'
      WHEN 'charged' THEN 'active'
      WHEN 'paused' THEN 'expired'
      WHEN 'resumed' THEN 'active'
      WHEN 'cancelled' THEN 'cancelled'
      WHEN 'completed' THEN 'expired'
      ELSE 'pending'
    END;

    IF v_subscription_id IS NOT NULL AND btrim(v_subscription_id) <> '' THEN
      SELECT cs.id, cs.company_id
      INTO v_checkout_session_id, v_company_id
      FROM public.checkout_sessions cs
      WHERE cs.provider_subscription_id = v_subscription_id
      ORDER BY cs.created_at DESC
      LIMIT 1;

      IF v_company_id IS NULL THEN
        SELECT csub.company_id
        INTO v_company_id
        FROM public.company_subscriptions csub
        WHERE csub.razorpay_subscription_id = v_subscription_id
        ORDER BY csub.updated_at DESC, csub.created_at DESC
        LIMIT 1;
      END IF;

      IF v_company_id IS NOT NULL THEN
        BEGIN
          IF (v_subscription_entity ? 'current_start') THEN
            v_period_start := to_timestamp((v_subscription_entity #>> '{current_start}')::bigint);
          ELSIF (v_subscription_entity ? 'current_period_start') THEN
            v_period_start := to_timestamp((v_subscription_entity #>> '{current_period_start}')::bigint);
          END IF;
        EXCEPTION WHEN others THEN
          v_period_start := NULL;
        END;

        BEGIN
          IF (v_subscription_entity ? 'current_end') THEN
            v_period_end := to_timestamp((v_subscription_entity #>> '{current_end}')::bigint);
          ELSIF (v_subscription_entity ? 'current_period_end') THEN
            v_period_end := to_timestamp((v_subscription_entity #>> '{current_period_end}')::bigint);
          END IF;
        EXCEPTION WHEN others THEN
          v_period_end := NULL;
        END;

        UPDATE public.company_subscriptions
        SET
          status = v_subscription_status,
          razorpay_subscription_id = COALESCE(NULLIF(v_subscription_id, ''), razorpay_subscription_id),
          current_period_start = COALESCE(v_period_start, current_period_start),
          current_period_end = COALESCE(v_period_end, current_period_end),
          next_billing_at = COALESCE(v_period_end, next_billing_at),
          renewal_date = COALESCE(v_period_end, renewal_date),
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('last_event_id', p_event_id, 'last_event_type', p_event_type),
          updated_at = v_now
        WHERE company_id = v_company_id
          AND (razorpay_subscription_id IS NULL OR razorpay_subscription_id = v_subscription_id);

        v_result := v_result || jsonb_build_object(
          'subscription', jsonb_build_object(
            'subscription_id', v_subscription_id,
            'status', v_subscription_status,
            'company_id', v_company_id
          )
        );
      END IF;
    END IF;
  END IF;

  -- =========================================================
  -- Invoice events (subscription invoices)
  -- =========================================================
  IF p_event_type IN ('invoice.paid', 'invoice.payment_failed') THEN
    v_invoice_entity := coalesce(p_payload #> '{payload,invoice,entity}', '{}'::jsonb);
    v_invoice_id := v_invoice_entity #>> '{id}';
    v_subscription_id := coalesce(v_invoice_entity #>> '{subscription_id}', v_invoice_entity #>> '{subscription}');

    v_invoice_status := CASE
      WHEN p_event_type = 'invoice.paid' THEN 'paid'
      WHEN p_event_type = 'invoice.payment_failed' THEN 'payment_failed'
      ELSE 'issued'
    END;

    v_invoice_pdf_url := v_invoice_entity #>> '{short_url}';
    IF v_invoice_pdf_url IS NULL OR btrim(v_invoice_pdf_url) = '' THEN
      v_invoice_pdf_url := v_invoice_entity #>> '{invoice_pdf}';
    END IF;

    v_invoice_paid_at := NULL;
    BEGIN
      IF (v_invoice_entity ? 'paid_at') THEN
        v_invoice_paid_at := to_timestamp((v_invoice_entity #>> '{paid_at}')::bigint);
      END IF;
    EXCEPTION WHEN others THEN
      v_invoice_paid_at := NULL;
    END;

    IF v_subscription_id IS NOT NULL AND btrim(v_subscription_id) <> '' THEN
      SELECT csub.company_id INTO v_company_id
      FROM public.company_subscriptions csub
      WHERE csub.razorpay_subscription_id = v_subscription_id
      ORDER BY csub.updated_at DESC, csub.created_at DESC
      LIMIT 1;
    END IF;

    IF v_company_id IS NOT NULL AND v_invoice_id IS NOT NULL AND btrim(v_invoice_id) <> '' THEN
      INSERT INTO public.billing_invoices (
        company_id,
        invoice_type,
        status,
        provider,
        provider_invoice_id,
        provider_subscription_id,
        provider_payment_id,
        invoice_pdf_url,
        issued_at,
        paid_at,
        metadata,
        updated_at
      )
      VALUES (
        v_company_id,
        'subscription',
        v_invoice_status,
        'razorpay',
        v_invoice_id,
        v_subscription_id,
        v_invoice_entity #>> '{payment_id}',
        v_invoice_pdf_url,
        v_now,
        v_invoice_paid_at,
        jsonb_build_object('event_id', p_event_id, 'event_type', p_event_type),
        v_now
      )
      ON CONFLICT (provider, provider_invoice_id) DO UPDATE
      SET
        status = EXCLUDED.status,
        provider_payment_id = COALESCE(EXCLUDED.provider_payment_id, public.billing_invoices.provider_payment_id),
        invoice_pdf_url = COALESCE(EXCLUDED.invoice_pdf_url, public.billing_invoices.invoice_pdf_url),
        paid_at = COALESCE(EXCLUDED.paid_at, public.billing_invoices.paid_at),
        metadata = COALESCE(public.billing_invoices.metadata, '{}'::jsonb) || EXCLUDED.metadata,
        updated_at = v_now;

      v_result := v_result || jsonb_build_object(
        'invoice', jsonb_build_object(
          'invoice_id', v_invoice_id,
          'status', v_invoice_status,
          'company_id', v_company_id
        )
      );
    END IF;
  END IF;

  -- =========================================================
  -- Order / payment events (Phase-3 checkout session activation)
  -- =========================================================
  IF p_event_type IN ('order.paid', 'payment.captured') THEN
    v_order_id := COALESCE(
      p_payload #>> '{payload,order,entity,id}',
      p_payload #>> '{payload,payment,entity,order_id}'
    );
    v_payment_id := p_payload #>> '{payload,payment,entity,id}';

    BEGIN
      v_payment_amount_paise := NULLIF(p_payload #>> '{payload,payment,entity,amount}', '')::bigint;
    EXCEPTION WHEN others THEN
      v_payment_amount_paise := NULL;
    END;

    IF v_order_id IS NOT NULL AND btrim(v_order_id) <> '' THEN
      UPDATE public.razorpay_orders
      SET
        status = 'paid',
        paid_at = v_now,
        payment_id = COALESCE(NULLIF(v_payment_id, ''), payment_id)
      WHERE order_id = v_order_id;

      SELECT *
      INTO v_checkout_session
      FROM public.checkout_sessions cs
      WHERE cs.provider_topup_order_id = v_order_id
      ORDER BY cs.created_at DESC
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        v_checkout_session_id := (v_checkout_session).id;
        v_company_id := (v_checkout_session).company_id;

        IF lower(coalesce((v_checkout_session).status::text, '')) = 'completed' THEN
          v_result := v_result || jsonb_build_object(
            'checkout', jsonb_build_object(
              'checkout_session_id', v_checkout_session_id,
              'order_id', v_order_id,
              'ignored', true,
              'reason', 'already_completed'
            )
          );
        ELSE
          v_plan_template_id := (v_checkout_session).selected_plan_template_id;
          v_plan_version_id := (v_checkout_session).selected_plan_version_id;
          v_billing_cycle := lower(coalesce((v_checkout_session).quote_payload_json #>> '{plan,billing_cycle}', 'monthly'));
          IF v_billing_cycle <> 'yearly' THEN
            v_billing_cycle := 'monthly';
          END IF;

          v_plan_unit := GREATEST(0, COALESCE(NULLIF((v_checkout_session).quote_payload_json #>> '{plan,quotas,unit}', '')::int, 0));
          v_plan_box := GREATEST(0, COALESCE(NULLIF((v_checkout_session).quote_payload_json #>> '{plan,quotas,box}', '')::int, 0));
          v_plan_carton := GREATEST(0, COALESCE(NULLIF((v_checkout_session).quote_payload_json #>> '{plan,quotas,carton}', '')::int, 0));
          v_plan_pallet := GREATEST(0, COALESCE(NULLIF((v_checkout_session).quote_payload_json #>> '{plan,quotas,pallet}', '')::int, 0));
          v_plan_seat := GREATEST(0, COALESCE(NULLIF((v_checkout_session).quote_payload_json #>> '{plan,capacities,seat}', '')::int, 0));
          v_plan_plant := GREATEST(0, COALESCE(NULLIF((v_checkout_session).quote_payload_json #>> '{plan,capacities,plant}', '')::int, 0));
          v_plan_handset := GREATEST(0, COALESCE(NULLIF((v_checkout_session).quote_payload_json #>> '{plan,capacities,handset}', '')::int, 0));

          v_total_amount_paise := GREATEST(0, COALESCE(NULLIF((v_checkout_session).totals_json #>> '{grand_total_paise}', '')::bigint, 0));
          v_total_amount_inr := v_total_amount_paise / 100.0;

          v_period_start := v_now;
          v_period_end := CASE
            WHEN v_billing_cycle = 'yearly' THEN (v_now + interval '1 year')
            ELSE (v_now + interval '1 month')
          END;

          SELECT cs.id
          INTO v_existing_subscription_id
          FROM public.company_subscriptions cs
          WHERE cs.company_id = v_company_id
          ORDER BY cs.updated_at DESC NULLS LAST, cs.created_at DESC
          LIMIT 1
          FOR UPDATE;

          IF v_existing_subscription_id IS NULL THEN
            INSERT INTO public.company_subscriptions (
              company_id,
              status,
              plan_template_id,
              plan_version_id,
              billing_cycle,
              start_date,
              renewal_date,
              current_period_start,
              current_period_end,
              next_billing_at,
              unit_subscription_quota,
              box_subscription_quota,
              carton_subscription_quota,
              pallet_subscription_quota,
              seat_limit,
              plant_limit,
              handset_limit,
              metadata,
              activated_at,
              created_at,
              updated_at
            )
            VALUES (
              v_company_id,
              'active',
              v_plan_template_id,
              v_plan_version_id,
              v_billing_cycle,
              v_period_start,
              v_period_end,
              v_period_start,
              v_period_end,
              v_period_end,
              v_plan_unit,
              v_plan_box,
              v_plan_carton,
              v_plan_pallet,
              v_plan_seat,
              v_plan_plant,
              v_plan_handset,
              jsonb_build_object(
                'checkout_session_id', v_checkout_session_id,
                'order_id', v_order_id,
                'payment_id', v_payment_id,
                'activated_via', 'payment_webhook'
              ),
              v_now,
              v_now,
              v_now
            );
          ELSE
            UPDATE public.company_subscriptions
            SET
              status = 'active',
              plan_template_id = v_plan_template_id,
              plan_version_id = v_plan_version_id,
              billing_cycle = v_billing_cycle,
              start_date = v_period_start,
              renewal_date = v_period_end,
              current_period_start = v_period_start,
              current_period_end = v_period_end,
              next_billing_at = v_period_end,
              unit_subscription_quota = v_plan_unit,
              box_subscription_quota = v_plan_box,
              carton_subscription_quota = v_plan_carton,
              pallet_subscription_quota = v_plan_pallet,
              seat_limit = v_plan_seat,
              plant_limit = v_plan_plant,
              handset_limit = v_plan_handset,
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'checkout_session_id', v_checkout_session_id,
                'order_id', v_order_id,
                'payment_id', v_payment_id,
                'activated_via', 'payment_webhook'
              ),
              activated_at = COALESCE(activated_at, v_now),
              updated_at = v_now
            WHERE id = v_existing_subscription_id;
          END IF;

          -- Capacity add-ons expire each cycle; expire previous active structural add-ons first.
          UPDATE public.company_addon_subscriptions cas
          SET
            status = 'expired',
            ends_at = COALESCE(cas.ends_at, v_period_start),
            updated_at = v_now
          FROM public.add_ons ao
          WHERE cas.company_id = v_company_id
            AND cas.addon_id = ao.id
            AND cas.status = 'active'
            AND ao.addon_kind = 'structural'
            AND ao.billing_mode = 'recurring';

          INSERT INTO public.company_addon_subscriptions (
            company_id,
            addon_id,
            quantity,
            status,
            checkout_session_id,
            starts_at,
            ends_at,
            metadata,
            created_at,
            updated_at
          )
          SELECT
            v_company_id,
            (line->>'addon_id')::uuid,
            GREATEST((line->>'quantity')::int, 1),
            'active',
            v_checkout_session_id,
            v_period_start,
            v_period_end,
            jsonb_build_object(
              'event_id', p_event_id,
              'event_type', p_event_type,
              'payment_id', v_payment_id,
              'order_id', v_order_id
            ),
            v_now,
            v_now
          FROM jsonb_array_elements(
            COALESCE(
              (v_checkout_session).quote_payload_json->'capacity_addons',
              (v_checkout_session).quote_payload_json->'structural_addons',
              '[]'::jsonb
            )
          ) AS line
          ON CONFLICT (company_id, addon_id, checkout_session_id) DO UPDATE
          SET
            quantity = EXCLUDED.quantity,
            status = 'active',
            starts_at = EXCLUDED.starts_at,
            ends_at = EXCLUDED.ends_at,
            updated_at = v_now;

          -- One-time code add-ons carry forward until consumed.
          INSERT INTO public.company_addon_topups (
            company_id,
            addon_id,
            entitlement_key,
            purchased_quantity,
            consumed_quantity,
            status,
            checkout_session_id,
            provider,
            provider_order_id,
            provider_payment_id,
            amount,
            currency,
            metadata,
            created_at,
            updated_at
          )
          SELECT
            v_company_id,
            (line.item->>'addon_id')::uuid,
            (line.item->>'entitlement_key')::public.entitlement_key_enum,
            GREATEST(
              COALESCE(NULLIF((line.item->>'allocated_quota'), '')::bigint, 0),
              COALESCE(NULLIF((line.item->>'quantity'), '')::bigint, 0),
              1
            ),
            0,
            'paid',
            v_checkout_session_id,
            'razorpay',
            v_order_id,
            COALESCE(NULLIF(btrim(v_payment_id), ''), 'order:' || v_order_id) || ':' || COALESCE(line.item->>'addon_id', line.idx::text) || ':' || line.idx::text,
            COALESCE(((line.item->>'line_total_paise')::numeric / 100.0), 0),
            'INR',
            jsonb_build_object(
              'razorpay_payment_id', v_payment_id,
              'event_id', p_event_id,
              'event_type', p_event_type,
              'checkout_session_id', v_checkout_session_id
            ),
            v_now,
            v_now
          FROM jsonb_array_elements(
            COALESCE(
              (v_checkout_session).quote_payload_json->'code_addons',
              (v_checkout_session).quote_payload_json->'variable_topups',
              '[]'::jsonb
            )
          ) WITH ORDINALITY AS line(item, idx)
          ON CONFLICT (provider, provider_payment_id) DO NOTHING;

          -- Store a paid invoice for this checkout.
          INSERT INTO public.billing_invoices (
            company_id,
            invoice_type,
            status,
            provider,
            provider_payment_id,
            checkout_session_id,
            amount,
            currency,
            issued_at,
            paid_at,
            metadata,
            updated_at
          )
          VALUES (
            v_company_id,
            'subscription',
            'paid',
            'razorpay',
            COALESCE(NULLIF(btrim(v_payment_id), ''), v_order_id),
            v_checkout_session_id,
            v_total_amount_inr,
            'INR',
            v_now,
            v_now,
            jsonb_build_object(
              'event_id', p_event_id,
              'event_type', p_event_type,
              'order_id', v_order_id,
              'payment_id', v_payment_id,
              'payment_amount_paise', v_payment_amount_paise
            ),
            v_now
          );

          BEGIN
            PERFORM public.apply_cycle_reset(v_company_id, v_period_start, v_period_end);
          EXCEPTION
            WHEN undefined_function THEN
              NULL;
          END;

          UPDATE public.checkout_sessions
          SET
            status = 'completed'::public.checkout_session_status_enum,
            completed_at = COALESCE(completed_at, v_now),
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'payment_order_id', v_order_id,
              'payment_id', v_payment_id,
              'payment_captured_at', v_now,
              'payment_amount_paise', COALESCE(v_payment_amount_paise, v_total_amount_paise),
              'activated_via', 'razorpay_webhook'
            ),
            updated_at = v_now
          WHERE id = v_checkout_session_id;

          v_result := v_result || jsonb_build_object(
            'checkout_activation', jsonb_build_object(
              'company_id', v_company_id,
              'checkout_session_id', v_checkout_session_id,
              'order_id', v_order_id,
              'payment_id', v_payment_id,
              'activated', true
            )
          );
        END IF;
      END IF;
    END IF;
  END IF;

  UPDATE public.webhook_events
  SET
    processing_status = 'processed',
    processed_at = v_now,
    error_message = NULL
  WHERE id = v_webhook_id;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'event_id', p_event_id,
    'event_type', coalesce(nullif(btrim(p_event_type), ''), 'unknown'),
    'result', v_result
  );
EXCEPTION WHEN others THEN
  UPDATE public.webhook_events
  SET
    processing_status = 'failed',
    processed_at = now(),
    error_message = SQLERRM
  WHERE id = v_webhook_id;
  RAISE;
END;
$$;
