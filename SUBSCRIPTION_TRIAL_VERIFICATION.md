# Subscription & Trial Verification

## Prerequisites
- Apply migration: `supabase/migrations/20260225_trial_plan_null_is_trial.sql` (run via Supabase CLI or dashboard).

## 1. Trial verification
1. Create a new user (register + complete company setup).
2. Start trial: Settings page → "Start 15-Day Free Trial" or Pricing → trial CTA (no plan_id sent).
3. **Check subscription record** (DB or GET `/api/user/subscription`):
   - `plan_id` = NULL
   - `is_trial` = true
   - `status` = `trialing`
   - `trial_end` set (~15 days from now)
4. **Check access**: User can open dashboard and use app (middleware allows `trial` / `trialing`).

## 2. Paid verification
1. With a company that has no subscription (or after trial), subscribe to a paid plan via Pricing / upgrade flow.
2. **Check subscription record**:
   - `plan_id` != NULL
   - `status` = `ACTIVE`
3. User has full paid access.

## If either fails → fix is not complete
