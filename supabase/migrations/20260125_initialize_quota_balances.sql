-- =====================================================
-- INITIALIZE QUOTA BALANCES FROM EXISTING BILLING_USAGE
-- Migrates existing quota to balance fields for existing companies
-- =====================================================

-- Initialize quota balances for existing companies with active subscriptions
-- This sets initial balances based on current billing_usage quotas

DO $$
DECLARE
  v_company RECORD;
  v_usage RECORD;
  v_unit_quota INTEGER;
  v_sscc_quota INTEGER;
  v_is_yearly BOOLEAN;
BEGIN
  FOR v_company IN 
    SELECT id, subscription_plan, subscription_status
    FROM companies
    WHERE subscription_status IN ('trial', 'trialing', 'active', 'paid', 'live')
  LOOP
    -- Get current billing_usage quotas
    SELECT 
      unit_labels_quota,
      COALESCE(sscc_labels_quota, box_labels_quota + carton_labels_quota + pallet_labels_quota) as sscc_quota
    INTO v_usage
    FROM billing_usage
    WHERE company_id = v_company.id
      AND billing_period_start <= NOW()
      AND billing_period_end > NOW()
    ORDER BY billing_period_start DESC
    LIMIT 1;

    IF FOUND THEN
      v_unit_quota := COALESCE(v_usage.unit_labels_quota, 0);
      v_sscc_quota := COALESCE(v_usage.sscc_quota, 0);
      
      -- Check if plan is yearly
      v_is_yearly := v_company.subscription_plan ILIKE '%annual%' 
                  OR v_company.subscription_plan ILIKE '%yearly%'
                  OR v_company.subscription_plan ILIKE '%year%';

      -- Initialize balances
      -- For yearly plans: set balance to current quota (will accumulate on next rollover)
      -- For monthly plans: set balance to current quota (will reset each month)
      UPDATE companies
      SET
        unit_quota_balance = v_unit_quota,
        sscc_quota_balance = v_sscc_quota,
        last_quota_rollover_at = DATE_TRUNC('month', NOW())
      WHERE id = v_company.id
        AND (unit_quota_balance IS NULL OR unit_quota_balance = 0)
        AND (sscc_quota_balance IS NULL OR sscc_quota_balance = 0);
    END IF;
  END LOOP;
END $$;
