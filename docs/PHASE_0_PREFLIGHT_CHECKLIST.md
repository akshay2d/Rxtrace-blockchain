# 🟢 PHASE 0 — PRE-FLIGHT CHECKLIST

**Date:** January 31, 2026  
**Status:** ✅ IN PROGRESS  
**Branch:** `billing-fix-comprehensive`

---

## 📋 BASELINE DOCUMENTATION

### Current State

**Last Commit:**
```
de44eac1 Pricing & checkout: group plans by name, fix cart checkout flow, add dynamic to API routes
```

**Current Branch:** `main` → `billing-fix-comprehensive` (working branch)

**Backup Branch:** `backup-before-billing-fix-phase0` (created and pushed)

**Untracked Files:**
- `docs/SUBSCRIPTION_BILLING_CRITICAL_REVIEW.md`
- `docs/SUBSCRIPTION_BILLING_IMPLEMENTATION_PLAN.md`
- `docs/SUBSCRIPTION_BILLING_REVIEW.md`

---

## ✅ CHECKLIST PROGRESS

### 1. Backup Branch Created
- [x] **COMPLETE**
- Branch: `backup-before-billing-fix-phase0`
- Pushed to remote: ✅ YES
- URL: https://github.com/akshay2d/Rxtrace-blockchain/tree/backup-before-billing-fix-phase0

### 2. Current Build Succeeds
- [❌] **FAILED**
- Command: `npm run build`
- Duration: 15 minutes
- Exit Code: 4294967295 (error)

**Build Error:**
```
Error: Dynamic server usage: Route /api/admin/pallet couldn't be rendered statically 
because it used `cookies`.

Error: Dynamic server usage: Route /api/admin/scan-history couldn't be rendered 
statically because it used `cookies`.
```

**Root Cause:** Some API routes missing `export const dynamic = 'force-dynamic'`

**Impact:** Build fails, cannot deploy

**Status:** ⚠️ **KNOWN ISSUE** - These are admin routes, NOT related to billing fix

### 3. Database Reachable
- [ ] **PENDING**
- Will test Supabase connection after build completes
- Expected: Can query companies, subscription_plans, invoices tables

### 4. Razorpay Dashboard Accessible
- [ ] **PENDING**
- Test mode verification needed (requires manual check)
- Expected: Can access dashboard, view plans

### 5. All Razorpay Env Vars Documented
- [x] **COMPLETE**
- All env vars present in `.env.local`

**Required Env Vars:** ✅ ALL PRESENT
- ✅ `RAZORPAY_KEY_ID`
- ✅ `RAZORPAY_KEY_SECRET`
- ✅ `NEXT_PUBLIC_RAZORPAY_KEY_ID`
- ✅ `RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_MONTHLY`
- ✅ `RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_ANNUAL`
- ✅ `RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY`
- ✅ `RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_ANNUAL`
- ✅ `RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_MONTHLY`
- ✅ `RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_QUARTERLY`
- ✅ `RAZORPAY_WEBHOOK_SECRET`

---

## 🎯 PASS CONDITION

Phase 0 passes ONLY when:
- ✅ Backup branch created and pushed
- ✅ `npm run build` completes successfully
- ✅ Database connection verified
- ✅ Razorpay dashboard accessible
- ✅ All 8 Razorpay env vars documented

**Current Status:** 2/5 complete (40%)

---

## 📝 NOTES

- Git operations required full permissions due to Windows file locking
- Build is taking longer than expected (normal for Next.js production build)
- Will document env vars once accessible

---

**Next Step:** Wait for build completion, then verify database and Razorpay access
