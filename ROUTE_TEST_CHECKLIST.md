# Route Testing - Verify All Auth Flows

## Test Environment
- Server: http://localhost:3000 ✅ Running
- Status: Ready for testing

## Route Accessibility Test

### Public Routes (No Auth Required)
- [ ] GET `/` → Landing page
- [ ] GET `/auth/signin` → Sign in form
- [ ] GET `/auth/signup` → Sign up form
- [ ] GET `/pricing` → Pricing page
- [ ] GET `/compliance` → Compliance page
- [ ] GET `/contact` → Contact page

### Protected Routes (Auth Required)
- [ ] GET `/dashboard` → Should redirect to /auth/signin if not authenticated
- [ ] GET `/dashboard/billing` → Should redirect to /auth/signin if not authenticated
- [ ] GET `/regulator` → Should redirect to /auth/signin if not authenticated

### Conditional Routes (After Setup)
- [ ] GET `/onboarding/setup` (no company) → Shows setup form
- [ ] GET `/onboarding/setup` (with trial) → Redirects to /dashboard
- [ ] GET `/pricing` (with trial) → Shows billing info
- [ ] GET `/dashboard` (with trial) → Shows dashboard

## Critical API Endpoints

### Create Order (Payment)
- [ ] POST `/api/razorpay/create-order`
  - Input: `{ amount: 5, purpose: "trial_auth" }`
  - Expected: `{ order: { id, amount, currency }, keyId }`

### Activate Trial
- [ ] POST `/api/trial/activate`
  - Input: `{ company_id, plan, payment_id, order_id, signature }`
  - Expected: `{ success: true, company: { subscription_status: 'trial' } }`

### Get Subscription
- [ ] GET `/api/billing/subscription`
  - Expected: `{ company: { subscription_status, trial_end_date } }`

### Create Company Profile
- [ ] POST `/api/setup/create-company-profile`
  - Input: Company details
  - Expected: `{ success: true, company: { id, company_name } }`

## Middleware Validation Rules

### Rule 1: Unauthenticated Access
```
User: Not logged in
Route: /dashboard
Expected: Redirect to /auth/signin
Result: [ ] Pass
```

### Rule 2: No Company Profile
```
User: Logged in
Company: Not found
Route: /dashboard
Expected: Redirect to /onboarding/setup
Result: [ ] Pass
```

### Rule 3: No Active Subscription
```
User: Logged in
Company: Exists but subscription_status = null
Route: /dashboard
Expected: Redirect to /pricing
Result: [ ] Pass
```

### Rule 4: Trial Active (CRITICAL)
```
User: Logged in
Company: subscription_status = 'trial'
Route: /dashboard
Expected: Allow access (NOT redirect)
Result: [ ] Pass ⭐
```

### Rule 5: Subscription Active (CRITICAL)
```
User: Logged in
Company: subscription_status = 'active'
Route: /dashboard
Expected: Allow access (NOT redirect)
Result: [ ] Pass ⭐
```

## Flow Validation Checklist

### New User Flow
- [ ] Signup with email + password
- [ ] Verify email
- [ ] Redirects to /onboarding/setup
- [ ] Fill company profile
- [ ] Redirects to /pricing
- [ ] Click "Start Free Trial"
- [ ] Razorpay modal opens
- [ ] Complete payment (test mode)
- [ ] Redirects to /dashboard ⭐ KEY TEST
- [ ] Dashboard loads without errors
- [ ] Billing page accessible
- [ ] Trial details displayed

### Existing Trial User Flow
- [ ] Logout
- [ ] Login with trial user
- [ ] Redirects to /dashboard ⭐ KEY TEST
- [ ] Dashboard loads
- [ ] Can access billing page
- [ ] Can access all dashboard features

### Error Scenarios
- [ ] Invalid email signup → Shows error
- [ ] Missing company fields → Shows error
- [ ] Payment failure → Shows error, allows retry
- [ ] Stale session → Forces refresh
- [ ] Expired trial → Redirects to pricing (upgrade)

## Performance Checks

### Page Load Times
- [ ] `/auth/signin` → < 2s
- [ ] `/auth/signup` → < 2s
- [ ] `/pricing` → < 2s
- [ ] `/onboarding/setup` → < 2s
- [ ] `/dashboard` (after auth) → < 3s
- [ ] `/dashboard/billing` → < 3s

### API Response Times
- [ ] POST `/api/razorpay/create-order` → < 1s
- [ ] POST `/api/trial/activate` → < 2s
- [ ] GET `/api/billing/subscription` → < 1s
- [ ] POST `/api/setup/create-company-profile` → < 2s

## Session & Auth Tests

### Session Persistence
- [ ] Login → Page refresh → Still logged in
- [ ] Login → Navigate away → Still logged in
- [ ] Login → Close tab → Login required on return
- [ ] After payment → Session refreshed
- [ ] After trial activation → Session has new company data

### Token Validation
- [ ] Valid token → Access granted
- [ ] Expired token → Refresh offered
- [ ] Invalid token → Redirected to signin
- [ ] Missing token → Redirected to signin

## Browser Console Tests

```javascript
// Test 1: Check session
const { data } = await supabaseClient().auth.getSession();
console.log('Session valid:', !!data.session);

// Test 2: Check company
const { data: company } = await supabaseClient()
  .from('companies')
  .select('*')
  .maybeSingle();
console.log('Company subscription:', company?.subscription_status);

// Test 3: Check trial end date
console.log('Trial ends:', company?.trial_end_date);
```

## Completion Checklist

### Critical Tests (Must Pass)
- [ ] ⭐ New user → payment → dashboard redirect
- [ ] ⭐ Dashboard loads after trial activation
- [ ] ⭐ Existing trial user login works
- [ ] ⭐ No redirect loops
- [ ] ⭐ Session persists after payment

### Important Tests
- [ ] All routes accessible
- [ ] All APIs respond
- [ ] Error handling works
- [ ] Middleware validates correctly
- [ ] Billing page loads

### Nice to Have
- [ ] Performance good
- [ ] No console errors
- [ ] Mobile responsive
- [ ] Accessibility OK

## Sign-Off

- [ ] Developer: Tested locally ✓
- [ ] QA: Tested on staging ✓
- [ ] PM: Approved for production ✓

---

**Overall Status**: [PASS / FAIL / NEEDS WORK]

**Notes**:
```
(Add any notes or issues found during testing)
```
