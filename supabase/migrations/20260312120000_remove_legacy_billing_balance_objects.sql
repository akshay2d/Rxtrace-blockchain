-- Remove legacy wallet and credit-based billing objects.
-- Idempotent by design so it can be run safely across mixed environments.

DROP TABLE IF EXISTS public.billing_transactions CASCADE;
DROP TABLE IF EXISTS public.wallet_balance CASCADE;
DROP TABLE IF EXISTS public.wallet_ledger CASCADE;
DROP TABLE IF EXISTS public.wallet_topups CASCADE;
DROP TABLE IF EXISTS public.wallet_deductions CASCADE;
DROP TABLE IF EXISTS public.credit_balance CASCADE;
DROP TABLE IF EXISTS public.wallet_transactions CASCADE;
DROP TABLE IF EXISTS public.wallets CASCADE;
DROP TABLE IF EXISTS public.company_wallets CASCADE;

DROP INDEX IF EXISTS public.idx_billing_transactions_company_created;
DROP INDEX IF EXISTS public.idx_billing_transactions_type;
DROP INDEX IF EXISTS public.wallet_balance_company_id_idx;
DROP INDEX IF EXISTS public.wallet_ledger_company_id_idx;
DROP INDEX IF EXISTS public.credit_balance_company_id_idx;

DROP FUNCTION IF EXISTS public.wallet_update_and_record(text, text, numeric, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.wallet_update_and_record(uuid, text, numeric, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.wallet_charge(uuid, numeric, text) CASCADE;
DROP FUNCTION IF EXISTS public.wallet_deduction(uuid, numeric, text) CASCADE;
DROP FUNCTION IF EXISTS public.billing_charge(uuid, numeric, text) CASCADE;
DROP FUNCTION IF EXISTS public.wallet_balance_refresh() CASCADE;
DROP FUNCTION IF EXISTS public.credit_balance_refresh() CASCADE;

DO $$
BEGIN
  IF to_regclass('public.companies') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_wallet_balance_refresh ON public.companies';
    EXECUTE 'DROP TRIGGER IF EXISTS trg_credit_balance_refresh ON public.companies';
  END IF;

  IF to_regclass('public.wallet_transactions') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_wallet_transactions_after_insert ON public.wallet_transactions';
  END IF;

  IF to_regclass('public.billing_transactions') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_billing_transactions_after_insert ON public.billing_transactions';
  END IF;
END $$;

ALTER TABLE IF EXISTS public.billing_invoices
  DROP COLUMN IF EXISTS wallet_applied;

ALTER TABLE IF EXISTS public.companies
  DROP COLUMN IF EXISTS wallet_balance,
  DROP COLUMN IF EXISTS credit_limit,
  DROP COLUMN IF EXISTS low_balance_alert,
  DROP COLUMN IF EXISTS credit_balance;
