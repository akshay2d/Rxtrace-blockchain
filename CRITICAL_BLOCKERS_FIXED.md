# CRITICAL BLOCKERS FIXED
**Date:** 2025-01-20  
**Status:** 🔴 BLOCKER 1 & Handset Dependencies FIXED | ⚠️ BLOCKERS 2-4 PENDING

---

## ✅ **FIXED: BLOCKER 1 - Expiry Status Evaluation in `/api/scan`**

### Changes Applied:
1. **Added `isExpired()` helper function** (copied from `/api/verify/route.ts`)
2. **Added expiry evaluation before logging scan**:
   - Extract expiry from `data.expiryDate`
   - Call `isExpired()` to check if product is expired
   - Set `expiryStatus: "VALID" | "EXPIRED"`
   - Set `scanStatus: "SUCCESS" | "ERROR"` based on expiry
   - Set `errorReason: "PRODUCT_EXPIRED"` if expired

3. **Updated scan logging**:
   - Store `metadata.expiry_status: "VALID" | "EXPIRED"`
   - Store `status: "SUCCESS" | "ERROR"` (ERROR if expired)
   - Store `metadata.error_reason` if expired

### Code Location:
- `app/api/scan/route.ts` (lines 6-26, 159-177, 444-476)

---

## ✅ **FIXED: Handset Dependencies Removed from `/api/scan`**

### Changes Applied:
1. **Removed `handset_id` requirement**:
   - Changed request validation from `!raw || !handset_id || !company_id` to `!raw` only
   - Removed handset validation logic
   - Removed `high_scan_enabled` check (deprecated concept)

2. **Made `company_id` optional with auto-resolution**:
   - Resolve `company_id` from GS1 payload AI 93 (company name) if provided
   - Resolve `company_id` from scanned entity (unit/box/carton/pallet) if found
   - Resolve `company_id` from unit serial lookup
   - Resolve `company_id` from SSCC lookup (pallet/carton/box)

3. **Made `handset_id` optional in scan logging**:
   - Changed `handset_id` to `null` in all `scan_logs.insert()` calls
   - Added optional `device_context` parameter (non-blocking, for analytics only)

4. **Updated all company_id references**:
   - Changed `company_id` variable to `resolvedCompanyId` throughout
   - All database queries now use `resolvedCompanyId`

### Code Location:
- `app/api/scan/route.ts` (lines 77-166, 180-476)

---

## ⚠️ **PENDING: BLOCKER 2 - Scanner UI Expiry Visualization**

### Required Fixes:
1. **Dashboard History Page** (`app/dashboard/history/page.tsx`):
   - Add expiry status indicator column (green ✔ / red ❌)
   - Evaluate expiry at display time: `isExpired(scan.parsed?.expiryDate)`
   - Show status badge: "VALID PRODUCT" or "EXPIRED PRODUCT"
   - Color-code rows: green for valid, red for expired

2. **Dashboard Analytics** (`app/dashboard/page.tsx`):
   - Add KPI cards: "Valid Product Scans" (green), "Expired Product Scans" (red)
   - Update stats API to include expiry breakdown

3. **Scanner Mobile App UI** (if exists):
   - Display green ✔ / red ❌ indicators on scan result screen
   - Show status label: "VALID PRODUCT" or "EXPIRED PRODUCT"
   - Display expiry date prominently

---

## ⚠️ **PENDING: BLOCKER 3 - Settings Page Missing User/Company Profile**

### Required Fixes:
1. **Add User Profile Section**:
   - Editable: Full Name, Phone
   - Read-only: Email, User ID
   - API endpoint: `POST /api/user/profile/update` (needs to be created)

2. **Add Company Profile Section**:
   - Editable: Company Name, GST Number, PAN Number, Address
   - Read-only: Company ID, Owner Email, Owner User ID
   - API endpoint: `POST /api/company/profile/update` (needs to be created)

3. **Update Page Title**:
   - Change from "Integrations" to "Settings"
   - Use tabs or sections: "User Profile", "Company Profile", "ERP Integration"

---

## ⚠️ **PENDING: BLOCKER 4 - ERP Add-On Billing Violates Business Rules**

### Required Fixes:
1. **Remove ERP from add-ons**:
   - Remove `"erp"` from `AddonKind` type in `app/api/addons/cart/create-order/route.ts`
   - Remove ERP from `ADDONS` array in `app/pricing/page.tsx`
   - Remove ERP add-on handling in `app/api/addons/activate/route.ts` and `app/api/razorpay/webhook/route.ts`

2. **Update ERP integration logic** (`app/api/integrations/save/route.ts`):
   - Change limit check to: "1 ERP per user_id (not company_id)"
   - Remove `extra_erp_integrations` column dependency
   - Allow first ERP per user_id for FREE

3. **Update pricing page**:
   - Remove "Additional ERP integration" from add-ons table
   - Update messaging: "1 ERP integration per User ID included (free)"

---

## 📋 **VERIFICATION CHECKLIST**

### ✅ Verified:
- [x] `/api/scan` no longer requires `handset_id`
- [x] `/api/scan` evaluates expiry status before logging
- [x] `/api/scan` resolves `company_id` from GS1 payload (AI 93) or scanned entity
- [x] `/api/scan` logs `expiry_status: "VALID" | "EXPIRED"` in metadata
- [x] `/api/scan` logs `status: "ERROR"` if product is expired
- [x] `scan_logs.handset_id` is nullable (verified in database schema)
- [x] Device context is optional (non-blocking)

### ⚠️ Pending Verification:
- [ ] Dashboard history page shows expiry indicators
- [ ] Dashboard analytics show expiry breakdown
- [ ] Settings page has User Profile and Company Profile sections
- [ ] ERP add-on removed from pricing and billing
- [ ] First ERP per user_id is free

---

## 🎯 **NEXT STEPS**

1. **Fix BLOCKER 2** (Expiry Visualization):
   - Update `app/dashboard/history/page.tsx`
   - Update `app/dashboard/page.tsx` (analytics)
   - Update scanner mobile app UI (if exists)

2. **Fix BLOCKER 3** (Settings Page):
   - Add User Profile section
   - Add Company Profile section
   - Create API endpoints: `/api/user/profile/update` and `/api/company/profile/update`

3. **Fix BLOCKER 4** (ERP Billing):
   - Remove ERP from add-ons
   - Update ERP integration logic
   - Update pricing page

---

**END OF REPORT**
