# Auth Flow Testing Checklist - Post Payment Setup Page Issue

## Test Environment
- **Server**: http://localhost:3000
- **Status**: ✅ Running (Next.js 14.2.35)
- **Date**: January 16, 2026

## Test Flow

### 1. Sign Up / New User
```
Route: http://localhost:3000/auth/signup
Expected: Signup form appears
Action: Create new account with test email + password
Result: Should redirect to /onboarding/setup after email verification
```

### 2. Company Profile Setup
```
Route: http://localhost:3000/onboarding/setup
Expected: Company profile form appears
Action: Fill all required fields (Company Name, Contact Person, PAN, etc.)
Result: Form should disable during submit, then redirect to /pricing
```

### 3. Pricing & Trial Selection
```
Route: http://localhost:3000/pricing
Expected: Pricing plans displayed with "Start Free Trial" button
Action: Click "Start Free Trial" button (₹5 payment)
Result: Razorpay modal should open
```

### 4. Payment Processing (CRITICAL TEST)
```
Route: Razorpay Modal
Expected: Payment gateway loads
Action: Complete payment (use test credentials)
Result: Payment success → Activate trial API called → Session refreshed
```

### 5. Dashboard Access (POST-PAYMENT)
```
Route: Should redirect to http://localhost:3000/dashboard
Expected: 
  - Middleware validates subscription_status === 'trial'
  - Dashboard layout loads
  - User can access billing page
Result: ✅ User lands on dashboard (NOT stuck on pricing page)
```

## Critical Fix Points

### Middleware (app/middleware.ts)
- ✅ Fixed matcher - removed `/onboarding/*` conflict
- ✅ Added explicit checks for `'trial'` and `'active'` status
- ✅ Removed truthy check on subscription_status

### Pricing Page (app/pricing/page.tsx)
- ✅ Added session refresh after trial activation
- ✅ Changed redirect from `/dashboard/billing?trial=active` to `/dashboard`
- ✅ Added 500ms delay for session propagation

### Auth Flow (app/auth/signin/page.tsx)
- ✅ Fixed subscription status checks

### Onboarding Setup (app/onboarding/setup/page.tsx)
- ✅ Fixed subscription status recognition

## Expected Behavior After Fixes

| Flow Stage | Before Fix | After Fix |
|-----------|-----------|----------|
| Company setup → Pricing | ✅ Works | ✅ Works |
| Start Trial (₹5 payment) | ✅ Works | ✅ Works |
| Payment success | ✅ Activates trial | ✅ Activates trial + refreshes session |
| Redirect after payment | ❌ Stuck on pricing | ✅ Redirects to dashboard |
| Dashboard access | ❌ Redirect loop | ✅ Middleware validates + allows access |
| Billing page access | ❌ Can't access | ✅ Loads properly |

## Debugging Commands

```bash
# Check subscription_status in company record
SELECT user_id, company_name, subscription_status, trial_end_date FROM companies WHERE user_id = '<user_id>';

# Check trial activation logs
SELECT * FROM audit_logs WHERE action = 'trial_activated' ORDER BY created_at DESC LIMIT 5;

# Verify session state (browser DevTools)
localStorage.getItem('supabase.auth.token')
```

## Common Issues & Solutions

### Issue 1: Session not refreshing after payment
- **Cause**: Old code didn't call `auth.refreshSession()`
- **Fix**: Added `await supabaseClient().auth.refreshSession()` in pricing page

### Issue 2: Middleware redirect loop
- **Cause**: `/onboarding/*` in matcher but `/onboarding` in exempt list
- **Fix**: Explicit path exemptions + removed from matcher

### Issue 3: Not recognizing trial status
- **Cause**: Checking `subscription_status` as truthy (null/falsy)
- **Fix**: Explicit check `=== 'trial' || === 'active'`

## Next Steps After Testing

1. ✅ Verify new user signup → setup → payment flow works
2. ✅ Verify dashboard loads after payment (no redirect loops)
3. ✅ Test billing page loads correctly
4. ✅ Test login with existing trial account
5. ⏳ Prepare for production deployment
