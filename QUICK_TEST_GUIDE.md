# Quick Test Guide - Auth Flow Fix Verification

## ✅ All Fixes Applied

### Files Modified:
1. ✅ `app/middleware.ts` - Routing and subscription checks fixed
2. ✅ `app/pricing/page.tsx` - Session refresh + correct redirect added
3. ✅ `app/auth/signin/page.tsx` - Subscription status checks fixed
4. ✅ `app/onboarding/setup/page.tsx` - Subscription status checks fixed

### Server Status:
- **Running on**: http://localhost:3000
- **Status**: ✅ Ready (Next.js 14.2.35)
- **Compilation**: ✅ Complete

---

## Manual Testing Steps

### Scenario A: New User → Trial → Dashboard

**Step 1: Visit Signup**
```
http://localhost:3000/auth/signup
- Fill email & password
- Click Sign Up
- ✓ Should receive verification email
```

**Step 2: Verify Email & Setup Company**
```
- Click email verification link
- Should redirect to http://localhost:3000/onboarding/setup
- Fill all company details:
  * Company Name (required)
  * Contact Person (required)
  * Firm Type (required)
  * Address (required)
  * Email (required)
  * Phone (required)
  * PAN (required) ← Minimum 10 chars
  * GST (optional)
  * Business Category (required)
  * Business Type (required)
- Click "Save Profile & Continue to Pricing →"
- ✓ Should redirect to /pricing
```

**Step 3: Start Free Trial**
```
http://localhost:3000/pricing
- See "Start Free Trial" button (₹5 authorization)
- Click the button
- ✓ Razorpay modal should open
```

**Step 4: Complete Payment** ⭐ CRITICAL TEST
```
- In Razorpay modal, enter test payment details
- Complete payment
- ✓ Should show payment success message
- ✓ API calls:
  * POST /api/razorpay/create-order (creates ₹5 order)
  * POST /api/trial/activate (activates trial, sets subscription_status='trial')
  * Session refresh (auth.refreshSession())
- ✓ Should redirect to /dashboard (NOT /pricing!)
```

**Step 5: Verify Dashboard Access** ⭐ MAIN FIX VERIFICATION
```
http://localhost:3000/dashboard
✓ Should load WITHOUT redirect loop
✓ Middleware should:
  * Validate session exists
  * Fetch company from DB
  * Check subscription_status === 'trial'
  * Allow access (NOT redirect to /pricing)
✓ Should see dashboard layout with sidebar & content
```

**Step 6: Verify Billing Page**
```
http://localhost:3000/dashboard/billing
✓ Should load successfully
✓ Should show:
  * Trial start date
  * Trial end date (15 days from now)
  * Plan details
  * Trial authorization invoice (₹5)
```

---

### Scenario B: Existing Trial User → Login

**Step 1: Login**
```
http://localhost:3000/auth/signin
- Use email from Scenario A
- Enter password
- Click Sign In
- ✓ Should fetch company data
- ✓ Should detect subscription_status === 'trial'
- ✓ Should redirect to /dashboard
```

**Step 2: Dashboard Loads**
```
http://localhost:3000/dashboard
✓ Should load (same as Scenario A, Step 5)
```

---

## Debug Checklist

### Browser Console Errors?
```javascript
// Check for auth errors
localStorage.getItem('supabase.auth.token')
// Should return a valid JWT token

// Check session
supabaseClient().auth.getSession()
// Should return active session
```

### Stuck on Pricing After Payment?
**Check 1: Subscription Status Not Set**
```sql
SELECT id, subscription_status, trial_start_date, trial_end_date 
FROM companies 
WHERE user_id = '<your-user-id>';
```
Expected: `subscription_status = 'trial'`

**Check 2: API Error in Console**
```
F12 → Network tab
- Look for /api/trial/activate response
- If error: Check company_id, plan parameters
```

**Check 3: Session Not Refreshing**
```
After payment, check:
- Did /api/trial/activate return 200?
- Did session.refreshSession() complete?
- Is new token in localStorage?
```

### Stuck on Setup Page?
```
Check: User trying to access /onboarding/setup but already has trial
Fix: Should redirect to /dashboard (NOT loop)
Verify: existingCompany.subscription_status === 'trial' check in useEffect
```

---

## Browser Testing Tools

### Open DevTools
```
F12 or Ctrl+Shift+I
```

### Check Session State
```javascript
// Console:
const { data } = await supabaseClient().auth.getSession();
console.log(data.session);
// Should show user + access_token
```

### Check Company Data
```javascript
// Console:
const { data: company } = await supabaseClient()
  .from('companies')
  .select('*')
  .eq('user_id', data.session.user.id)
  .single();
console.log(company);
// Should show: subscription_status = 'trial'
```

### Check Network Requests
```
Network tab → 
  1. Create Order: POST /api/razorpay/create-order → 200 ✓
  2. Activate Trial: POST /api/trial/activate → 200 ✓
  3. Dashboard: GET /dashboard → 200 ✓
```

---

## Expected Log Output (Server Console)

### During New Trial Activation:
```
[api/trial/activate] Activating trial for company: <company-id>
[api/trial/activate] Trial end date: <date-15-days>
[api/trial/activate] Trial activated successfully
```

### During Dashboard Access:
```
[middleware] User authenticated, checking company...
[middleware] Company found with subscription_status: trial
[middleware] Access granted to /dashboard
```

---

## Success Indicators ✅

| Component | Before Fix | After Fix |
|-----------|-----------|----------|
| New signup to setup | ✓ | ✓ |
| Setup to pricing | ✓ | ✓ |
| Payment processing | ✓ | ✓ |
| Post-payment redirect | ❌ Stuck on /pricing | ✅ /dashboard |
| Middleware validation | ❌ Redirect loop | ✅ Allow access |
| Dashboard loads | ❌ | ✅ |
| Billing page access | ❌ | ✅ |
| Trial info displays | ❌ | ✅ |

---

## If Tests Pass ✅

1. Pull latest from git (all changes committed)
2. Run: `npm run build` (verify production build works)
3. Run: `npm run lint` (check for TypeScript/ESLint errors)
4. Deploy to production
5. Test on staging environment
6. Production release

---

## Rollback Plan (If Issues Found)

```bash
git log --oneline | head -5  # Find commit before auth fixes
git checkout <commit-hash>    # Revert to previous version
npm install && npm run dev    # Restart
```

---

## Support Documentation

See `AUTH_FLOW_TEST.md` for detailed flow diagrams and technical notes.
