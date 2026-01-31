# 🔍 RAZORPAY DASHBOARD VERIFICATION CHECKLIST

**Purpose:** Verify Razorpay is properly configured before starting development  
**Time Required:** 5-10 minutes  
**Access:** https://dashboard.razorpay.com/

---

## 📋 VERIFICATION STEPS

### 1. Login & Test Mode Verification

**Steps:**
1. Go to https://dashboard.razorpay.com/
2. Login with your credentials
3. Check top-right corner for mode indicator

**What to verify:**
- [ ] Successfully logged in
- [ ] **Test Mode** is active (should show "Test Mode" badge)
- [ ] NOT in Live Mode (very important - we don't want to affect production)

**Expected:** Dashboard shows "Test Mode" clearly

---

### 2. Subscription Plans Verification

**Steps:**
1. In Razorpay dashboard, go to: **Subscriptions** → **Plans**
2. You should see a list of subscription plans

**What to verify:**
- [ ] At least 6 subscription plans exist
- [ ] Plans are named clearly (e.g., "Starter Monthly", "Growth Annual")
- [ ] Each plan has an ID (format: `plan_xxxxxxxxxxxxx`)

**Expected Plans (from your env vars):**

| Plan Name | Cycle | Env Var | Status |
|-----------|-------|---------|--------|
| Starter | Monthly | `RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_MONTHLY` | Should exist |
| Starter | Annual | `RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_ANNUAL` | Should exist |
| Growth | Monthly | `RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY` | Should exist |
| Growth | Annual | `RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_ANNUAL` | Should exist |
| Enterprise | Monthly | `RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_MONTHLY` | Should exist |
| Enterprise | Quarterly | `RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_QUARTERLY` | Should exist |

**Action:** Click on each plan and note down:
- Plan ID (e.g., `plan_Mxxxxxxxxxxxxx`)
- Plan Amount (in paise, e.g., 1800000 = ₹18,000)
- Billing Period (monthly, annual, quarterly)

---

### 3. Plan Amounts Verification

**For each plan, verify the amount matches your pricing:**

**Expected Amounts (based on billingConfig.ts):**

| Plan | Cycle | Expected Amount | In Paise |
|------|-------|-----------------|----------|
| Starter | Monthly | ₹18,000 | 1,800,000 |
| Starter | Annual | ₹2,00,000 | 20,000,000 |
| Growth | Monthly | ₹49,000 | 4,900,000 |
| Growth | Annual | ₹5,00,000 | 50,000,000 |
| Enterprise | Monthly | ₹2,00,000 | 20,000,000 |
| Enterprise | Quarterly | ₹5,00,000 | 50,000,000 |

**What to check:**
- [ ] Starter Monthly = ₹18,000 (1,800,000 paise)
- [ ] Starter Annual = ₹2,00,000 (20,000,000 paise)
- [ ] Growth Monthly = ₹49,000 (4,900,000 paise)
- [ ] Growth Annual = ₹5,00,000 (50,000,000 paise)
- [ ] Enterprise Monthly = ₹2,00,000 (20,000,000 paise)
- [ ] Enterprise Quarterly = ₹5,00,000 (50,000,000 paise)

**⚠️ CRITICAL:** If amounts don't match, this is a **BLOCKER** identified in the review!
- Database has one set of prices
- Razorpay has different prices
- This causes the "wrong amount charged" issue

---

### 4. Plan IDs Match Env Vars

**Steps:**
1. Open your `.env.local` file
2. For each plan in Razorpay dashboard, verify the plan ID matches

**Example:**
```
Razorpay Dashboard shows:
Plan: "Starter Monthly"
Plan ID: plan_Mxxxxxxxxxxxxx

.env.local should have:
RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_MONTHLY=plan_Mxxxxxxxxxxxxx
```

**What to verify:**
- [ ] All 6 plan IDs in `.env.local` match Razorpay dashboard
- [ ] No typos in plan IDs
- [ ] Plan IDs are for Test Mode (not Live Mode)

---

### 5. API Keys Verification

**Steps:**
1. In Razorpay dashboard, go to: **Settings** → **API Keys**
2. You should see Test Mode keys

**What to verify:**
- [ ] Test Key ID visible (format: `rzp_test_xxxxxxxxxxxxx`)
- [ ] Test Key Secret exists (hidden, but can be regenerated if needed)
- [ ] Keys are for **Test Mode** (very important)

**Match with env vars:**
```
RAZORPAY_KEY_ID should start with: rzp_test_
NEXT_PUBLIC_RAZORPAY_KEY_ID should match RAZORPAY_KEY_ID
```

**⚠️ WARNING:** Never use Live Mode keys during development!

---

### 6. Webhook Configuration (Optional Check)

**Steps:**
1. Go to: **Settings** → **Webhooks**
2. Check if webhook is configured

**What to verify:**
- [ ] Webhook URL is set (should point to your API endpoint)
- [ ] Webhook is active
- [ ] Events are selected (subscription.charged, payment.captured, etc.)

**Note:** This is optional for Phase 0, but good to verify

---

## 📊 VERIFICATION RESULTS TEMPLATE

**Copy this and fill it out:**

```
=== RAZORPAY DASHBOARD VERIFICATION ===
Date: 2026-01-31
Verified by: [Your Name]

1. Test Mode Active: [ ] YES / [ ] NO
2. Number of Plans Found: _____
3. Plan IDs Match Env Vars: [ ] YES / [ ] NO

Plan Amount Verification:
- Starter Monthly (₹18,000): [ ] MATCH / [ ] MISMATCH / [ ] MISSING
- Starter Annual (₹2,00,000): [ ] MATCH / [ ] MISMATCH / [ ] MISSING
- Growth Monthly (₹49,000): [ ] MATCH / [ ] MISMATCH / [ ] MISSING
- Growth Annual (₹5,00,000): [ ] MATCH / [ ] MISMATCH / [ ] MISSING
- Enterprise Monthly (₹2,00,000): [ ] MATCH / [ ] MISMATCH / [ ] MISSING
- Enterprise Quarterly (₹5,00,000): [ ] MATCH / [ ] MISMATCH / [ ] MISSING

4. API Keys (Test Mode): [ ] YES / [ ] NO
5. Webhook Configured: [ ] YES / [ ] NO / [ ] N/A

ISSUES FOUND:
[List any mismatches or problems]

OVERALL STATUS: [ ] PASS / [ ] FAIL
```

---

## 🚨 COMMON ISSUES TO LOOK FOR

### Issue 1: Amount Mismatch
**Symptom:** Razorpay plan amount ≠ Database plan amount  
**Impact:** Users charged wrong amount  
**Fix Required:** Update Razorpay plans OR update database to match

### Issue 2: Wrong Mode
**Symptom:** Live Mode active instead of Test Mode  
**Impact:** Real charges to real customers during testing  
**Fix Required:** Switch to Test Mode immediately

### Issue 3: Missing Plans
**Symptom:** Less than 6 plans in dashboard  
**Impact:** Some subscription options won't work  
**Fix Required:** Create missing plans in Razorpay

### Issue 4: Plan ID Mismatch
**Symptom:** Env var plan ID doesn't exist in Razorpay  
**Impact:** API calls will fail with "Invalid plan_id"  
**Fix Required:** Update env vars with correct plan IDs

---

## ✅ PASS CRITERIA

Phase 0 Razorpay verification passes ONLY if:
- ✅ Test Mode is active
- ✅ All 6 plans exist
- ✅ All plan amounts match expected values (or documented if different)
- ✅ All plan IDs match env vars
- ✅ API keys are Test Mode keys

**If ANY item fails → Phase 0 BLOCKED**

---

## 📝 NEXT STEPS AFTER VERIFICATION

**If PASS:**
- Document verification results
- Proceed with Phase 0 completion
- Move to Phase 1

**If FAIL:**
- Document all issues found
- Fix Razorpay configuration
- Re-verify before proceeding

---

**Time to complete:** 5-10 minutes  
**Difficulty:** Easy (just checking, no changes)  
**Required:** YES (critical for Phase 0)
