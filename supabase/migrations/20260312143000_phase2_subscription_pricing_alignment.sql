-- Phase 2 pricing alignment:
-- - admin-owned subscription pricing
-- - admin-owned add-on pricing unit sizes
-- - pending/active/expired/cancelled subscription states
-- - company subscription quota snapshots

ALTER TABLE IF EXISTS public.subscription_plan_templates
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS plan_price bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pricing_unit_size integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF to_regclass('public.subscription_plan_templates') IS NOT NULL THEN
    UPDATE public.subscription_plan_templates
    SET plan_price = COALESCE(NULLIF(plan_price, 0), amount_from_razorpay, 0);

    UPDATE public.subscription_plan_templates
    SET pricing_unit_size = 1
    WHERE pricing_unit_size IS NULL OR pricing_unit_size <= 0;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.subscription_plan_templates
  ALTER COLUMN pricing_unit_size SET DEFAULT 1;

ALTER TABLE IF EXISTS public.subscription_plan_versions
  ADD COLUMN IF NOT EXISTS unit_quota_units integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS box_quota_units integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carton_quota_units integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pallet_quota_units integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plant_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS handset_limit integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF to_regclass('public.subscription_plan_versions') IS NOT NULL
     AND to_regclass('public.subscription_plan_templates') IS NOT NULL THEN
    UPDATE public.subscription_plan_versions spv
    SET
      unit_quota_units = CASE
        WHEN COALESCE(spt.pricing_unit_size, 1) > 0 AND COALESCE(spv.unit_limit, 0) > 0
          THEN GREATEST(1, spv.unit_limit / spt.pricing_unit_size)
        ELSE COALESCE(spv.unit_quota_units, 0)
      END,
      box_quota_units = CASE
        WHEN COALESCE(spt.pricing_unit_size, 1) > 0 AND COALESCE(spv.box_limit, 0) > 0
          THEN GREATEST(1, spv.box_limit / spt.pricing_unit_size)
        ELSE COALESCE(spv.box_quota_units, 0)
      END,
      carton_quota_units = CASE
        WHEN COALESCE(spt.pricing_unit_size, 1) > 0 AND COALESCE(spv.carton_limit, 0) > 0
          THEN GREATEST(1, spv.carton_limit / spt.pricing_unit_size)
        ELSE COALESCE(spv.carton_quota_units, 0)
      END,
      pallet_quota_units = CASE
        WHEN COALESCE(spt.pricing_unit_size, 1) > 0 AND COALESCE(spv.pallet_limit, 0) > 0
          THEN GREATEST(1, spv.pallet_limit / spt.pricing_unit_size)
        ELSE COALESCE(spv.pallet_quota_units, 0)
      END
    FROM public.subscription_plan_templates spt
    WHERE spt.id = spv.template_id;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.subscription_plan_versions
  DROP COLUMN IF EXISTS grace_unit,
  DROP COLUMN IF EXISTS grace_box,
  DROP COLUMN IF EXISTS grace_carton,
  DROP COLUMN IF EXISTS grace_pallet;

ALTER TABLE IF EXISTS public.add_ons
  ADD COLUMN IF NOT EXISTS pricing_unit_size integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF to_regclass('public.add_ons') IS NOT NULL THEN
    UPDATE public.add_ons
    SET pricing_unit_size = 1
    WHERE pricing_unit_size IS NULL OR pricing_unit_size <= 0;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.company_subscriptions
  ADD COLUMN IF NOT EXISTS billing_cycle text,
  ADD COLUMN IF NOT EXISTS start_date timestamptz,
  ADD COLUMN IF NOT EXISTS renewal_date timestamptz,
  ADD COLUMN IF NOT EXISTS unit_subscription_quota integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS box_subscription_quota integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carton_subscription_quota integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pallet_subscription_quota integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seat_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS handset_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plant_limit integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF to_regclass('public.company_subscriptions') IS NOT NULL THEN
    UPDATE public.company_subscriptions
    SET status = lower(coalesce(status, 'pending'));

    UPDATE public.company_subscriptions
    SET status = 'active'
    WHERE status IN ('authenticated', 'activated', 'charged');

    UPDATE public.company_subscriptions
    SET status = 'cancelled'
    WHERE status IN ('canceled', 'cancel');

    UPDATE public.company_subscriptions
    SET status = 'pending'
    WHERE status IN ('trial', 'trialing');

    UPDATE public.company_subscriptions
    SET status = 'expired'
    WHERE status IN ('paused', 'past_due', 'completed');
  END IF;
END $$;

DO $$
DECLARE
  v_table regclass := to_regclass('public.company_subscriptions');
  v_constraint_name text;
BEGIN
  IF v_table IS NULL THEN
    RETURN;
  END IF;

  SELECT conname
  INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = v_table
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.company_subscriptions DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
  END IF;

  ALTER TABLE public.company_subscriptions
    ADD CONSTRAINT company_subscriptions_status_check
    CHECK (status IN ('active', 'expired', 'cancelled', 'pending'));
END $$;
