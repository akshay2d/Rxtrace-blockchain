-- ============================================
-- RxTrace India - Production RLS Policies
-- ============================================
-- Run this migration in Supabase BEFORE going live
-- This enables Row Level Security on all tables

-- ============================================
-- 1. COMPANIES TABLE
-- ============================================
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Users can view their own company
CREATE POLICY "Users can view own company" ON public.companies
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own company
CREATE POLICY "Users can update own company" ON public.companies
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "Service role full access companies" ON public.companies
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- 2. SEATS TABLE (Already has RLS from migration)
-- ============================================
-- Verify seats RLS is enabled
ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. SKUS TABLE
-- ============================================
ALTER TABLE public.skus ENABLE ROW LEVEL SECURITY;

-- Users can view SKUs from their company
CREATE POLICY "Users can view own company SKUs" ON public.skus
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Users can insert SKUs for their company
CREATE POLICY "Users can insert own company SKUs" ON public.skus
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats 
      WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin', 'manager')
    )
  );

-- Users can update SKUs from their company
CREATE POLICY "Users can update own company SKUs" ON public.skus
  FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats 
      WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin', 'manager')
    )
  );

-- Service role full access
CREATE POLICY "Service role full access skus" ON public.skus
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- 4. GENERATION_JOBS TABLE
-- ============================================
ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company generation jobs" ON public.generation_jobs
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Users can insert own company generation jobs" ON public.generation_jobs
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Service role full access generation_jobs" ON public.generation_jobs
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- 5. BILLING_USAGE TABLE
-- ============================================
ALTER TABLE public.billing_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company billing usage" ON public.billing_usage
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats 
      WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin')
    )
  );

CREATE POLICY "Service role full access billing_usage" ON public.billing_usage
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- 6. AUDIT_LOGS TABLE
-- ============================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company audit logs" ON public.audit_logs
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats 
      WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin')
    )
  );

CREATE POLICY "Service role full access audit_logs" ON public.audit_logs
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- 7. SCAN_LOGS TABLE
-- ============================================
ALTER TABLE public.scan_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company scan logs" ON public.scan_logs
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Service role full access scan_logs" ON public.scan_logs
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- 8. HANDSETS TABLE
-- ============================================
ALTER TABLE public.handsets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company handsets" ON public.handsets
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Users can manage own company handsets" ON public.handsets
  FOR ALL
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats 
      WHERE user_id = auth.uid() AND status = 'active' AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Service role full access handsets" ON public.handsets
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- 9. RAZORPAY_ORDERS TABLE
-- ============================================
ALTER TABLE public.razorpay_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company razorpay orders" ON public.razorpay_orders
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats 
      WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
    )
  );

CREATE POLICY "Service role full access razorpay_orders" ON public.razorpay_orders
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- 10. COMPANY_WALLETS TABLE
-- ============================================
ALTER TABLE public.company_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company wallet" ON public.company_wallets
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id = auth.uid()
    )
    OR
    company_id IN (
      SELECT company_id FROM public.seats 
      WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
    )
  );

CREATE POLICY "Service role full access company_wallets" ON public.company_wallets
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify RLS is enabled:

-- Check which tables have RLS enabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Check policies for each table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================
-- NOTES
-- ============================================
-- 1. Service role bypasses RLS (used in API routes)
-- 2. Users authenticated via auth.uid() can only see their own company data
-- 3. Seat-based users can access company data based on their role
-- 4. Admin role has broader access (billing, audit logs)
-- 5. Test thoroughly before enabling in production!
