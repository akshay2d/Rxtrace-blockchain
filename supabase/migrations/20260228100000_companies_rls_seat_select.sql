-- Allow seat members to SELECT their company (for canonical resolver in middleware/anon client).
-- Owner already has "Users can view own company" (user_id = auth.uid()).
-- This policy lets active seat members read the company row so resolveCompanyForUser works with anon key.

CREATE POLICY "Users can view company via active seat" ON public.companies
  FOR SELECT
  USING (
    id IN (
      SELECT company_id FROM public.seats
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

COMMENT ON POLICY "Users can view company via active seat" ON public.companies IS
  'Seat members can read company row for dashboard/middleware; required for canonical company resolver with anon client.';
