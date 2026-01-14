-- Billing: quotas enforcement helpers + add-on entitlements + subscription status
-- Run in Supabase SQL editor.

-- 1) Company add-on entitlements (recurring)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS extra_erp_integrations INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.companies.extra_erp_integrations IS 'Additional paid ERP integrations purchased as add-ons (added to plan base integrations)';

-- 2) Expand subscription_status allowed values
DO $$
DECLARE r record;
BEGIN
  FOR r IN (
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'companies'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%subscription_status%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_subscription_status_check
  CHECK (subscription_status IN ('trial', 'active', 'past_due', 'expired', 'cancelled'));

-- 3) Ensure we can upsert a single usage row per period
CREATE UNIQUE INDEX IF NOT EXISTS uniq_billing_usage_company_period_start
  ON public.billing_usage(company_id, billing_period_start);

-- 4) Atomic quota reservation/refund + quota top-ups
-- These functions operate on the active billing period containing p_at.
-- They are SECURITY DEFINER so server-side callers can bypass RLS safely.

CREATE OR REPLACE FUNCTION public.billing_usage_reserve(
  p_company_id uuid,
  p_kind text,
  p_qty integer,
  p_at timestamptz DEFAULT now()
)
RETURNS TABLE(ok boolean, error text, usage_id uuid) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE u_id uuid;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN QUERY SELECT false, 'invalid_qty', NULL::uuid;
    RETURN;
  END IF;

  SELECT bu.id INTO u_id
  FROM public.billing_usage bu
  WHERE bu.company_id = p_company_id
    AND p_at >= bu.billing_period_start
    AND p_at < bu.billing_period_end
  ORDER BY bu.billing_period_start DESC
  LIMIT 1;

  IF u_id IS NULL THEN
    RETURN QUERY SELECT false, 'no_active_billing_period', NULL::uuid;
    RETURN;
  END IF;

  IF p_kind = 'unit' THEN
    UPDATE public.billing_usage
      SET unit_labels_used = unit_labels_used + p_qty,
          updated_at = now()
      WHERE id = u_id
        AND unit_labels_used + p_qty <= unit_labels_quota
      RETURNING id INTO u_id;
  ELSIF p_kind = 'box' THEN
    UPDATE public.billing_usage
      SET box_labels_used = box_labels_used + p_qty,
          updated_at = now()
      WHERE id = u_id
        AND box_labels_used + p_qty <= box_labels_quota
      RETURNING id INTO u_id;
  ELSIF p_kind = 'carton' THEN
    UPDATE public.billing_usage
      SET carton_labels_used = carton_labels_used + p_qty,
          updated_at = now()
      WHERE id = u_id
        AND carton_labels_used + p_qty <= carton_labels_quota
      RETURNING id INTO u_id;
  ELSIF p_kind = 'pallet' THEN
    UPDATE public.billing_usage
      SET pallet_labels_used = pallet_labels_used + p_qty,
          updated_at = now()
      WHERE id = u_id
        AND pallet_labels_used + p_qty <= pallet_labels_quota
      RETURNING id INTO u_id;
  ELSE
    RETURN QUERY SELECT false, 'invalid_kind', NULL::uuid;
    RETURN;
  END IF;

  IF u_id IS NULL THEN
    RETURN QUERY SELECT false, 'quota_exceeded', NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text, u_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_usage_refund(
  p_usage_id uuid,
  p_kind text,
  p_qty integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_usage_id IS NULL OR p_qty IS NULL OR p_qty <= 0 THEN
    RETURN;
  END IF;

  IF p_kind = 'unit' THEN
    UPDATE public.billing_usage
      SET unit_labels_used = GREATEST(0, unit_labels_used - p_qty),
          updated_at = now()
      WHERE id = p_usage_id;
  ELSIF p_kind = 'box' THEN
    UPDATE public.billing_usage
      SET box_labels_used = GREATEST(0, box_labels_used - p_qty),
          updated_at = now()
      WHERE id = p_usage_id;
  ELSIF p_kind = 'carton' THEN
    UPDATE public.billing_usage
      SET carton_labels_used = GREATEST(0, carton_labels_used - p_qty),
          updated_at = now()
      WHERE id = p_usage_id;
  ELSIF p_kind = 'pallet' THEN
    UPDATE public.billing_usage
      SET pallet_labels_used = GREATEST(0, pallet_labels_used - p_qty),
          updated_at = now()
      WHERE id = p_usage_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_usage_add_quota(
  p_company_id uuid,
  p_kind text,
  p_qty integer,
  p_at timestamptz DEFAULT now()
)
RETURNS TABLE(ok boolean, error text, usage_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE u_id uuid;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN QUERY SELECT false, 'invalid_qty', NULL::uuid;
    RETURN;
  END IF;

  SELECT bu.id INTO u_id
  FROM public.billing_usage bu
  WHERE bu.company_id = p_company_id
    AND p_at >= bu.billing_period_start
    AND p_at < bu.billing_period_end
  ORDER BY bu.billing_period_start DESC
  LIMIT 1;

  IF u_id IS NULL THEN
    RETURN QUERY SELECT false, 'no_active_billing_period', NULL::uuid;
    RETURN;
  END IF;

  IF p_kind = 'unit' THEN
    UPDATE public.billing_usage SET unit_labels_quota = unit_labels_quota + p_qty, updated_at = now() WHERE id = u_id;
  ELSIF p_kind = 'box' THEN
    UPDATE public.billing_usage SET box_labels_quota = box_labels_quota + p_qty, updated_at = now() WHERE id = u_id;
  ELSIF p_kind = 'carton' THEN
    UPDATE public.billing_usage SET carton_labels_quota = carton_labels_quota + p_qty, updated_at = now() WHERE id = u_id;
  ELSIF p_kind = 'pallet' THEN
    UPDATE public.billing_usage SET pallet_labels_quota = pallet_labels_quota + p_qty, updated_at = now() WHERE id = u_id;
  ELSE
    RETURN QUERY SELECT false, 'invalid_kind', NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text, u_id;
END;
$$;
