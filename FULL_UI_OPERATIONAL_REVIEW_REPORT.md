# FULL UI & OPERATIONAL REVIEW REPORT
**RxTrace – Multi-tenant GS1 Pharmaceutical Traceability Platform**  
**Date:** 2025-01-20  
**Status:** ⚠️ **READY WITH CRITICAL FIXES REQUIRED**

---

## 1️⃣ EXECUTIVE SUMMARY

### ⚠️ **VERDICT: NOT FULLY PRODUCTION-READY FOR HIGH-VOLUME PHARMA USERS**

**Overall Risk Level:** 🟡 **HIGH** - Critical gaps in expiry handling, CSV/export formats, and UI completeness

**Primary Blockers:**
1. 🔴 **CRITICAL**: `/api/scan` does not evaluate expiry status (violates business rule)
2. 🔴 **CRITICAL**: Scanner UI does not display expiry status (green ✔ / red ❌ indicators)
3. 🔴 **CRITICAL**: Settings page missing User Profile and Company Profile editing
4. 🔴 **CRITICAL**: ERP add-on billing violates business rules (should be free, 1 per user_id)
5. 🟡 **HIGH**: CSV download format does not match CSV upload format (missing required fields)
6. 🟡 **HIGH**: ZIP export lacks metadata (filenames and CSV metadata file missing)
7. 🟡 **HIGH**: Dashboard scan analytics missing expiry breakdown (valid vs expired)
8. 🟡 **HIGH**: GTIN classification not implemented (GS1_ISSUED vs INTERNAL_NON_GS1)
9. 🟢 **MEDIUM**: Product naming inconsistency (sku_name vs product_name terminology)

---

## 2️⃣ CONFIRMED SAFE AREAS (NO CHANGES REQUIRED)

### ✅ **Dashboard Structure & Navigation**
- Dashboard page displays KPIs correctly (SKUs, units, SSCC, scans, wallet, seats, handsets)
- Sidebar navigation is consistent across all pages
- Header displays company name and user profile initial
- All menu links resolve to valid pages
- Label generation trend charts work correctly

### ✅ **Printer Integration**
- ✅ Printers are **UNLIMITED** per company
- ✅ No seat requirement for printers
- ✅ No billing for printers
- ✅ Printer API (`/api/printers`) allows unlimited add/remove
- ✅ Printers can be assigned to SKUs and jobs

### ✅ **Handset Generation**
- ✅ Handset generation is **FREE** (no billing calls found)
- ✅ No limits on handset generation
- ✅ Token generation respects admin settings
- ✅ Handsets page displays active handsets correctly

### ✅ **Seat Activation & User ID Rules**
- ✅ Seat = `user_id` enforced in database schema
- ✅ Seat quotas enforced via `billing_usage` table
- ✅ Invite seat consumes quota correctly
- ✅ Buy seat consumes quota correctly
- ✅ Team management page displays seat limits correctly

### ✅ **File Format Support (Code Generation)**
- ✅ **PDF**: Implemented correctly via `exportToPDF`
- ✅ **PNG**: Implemented correctly via `exportToPNG`
- ✅ **ZPL**: Implemented correctly with FNC1 preserved (`generateZpl`)
- ✅ **EPL**: Implemented correctly via `exportToEPL`
- ✅ **ZIP**: Implemented via `exportToZIP` (but lacks metadata - see issues)

### ✅ **GS1 Compliance (Code Generation)**
- ✅ Canonical GS1 payload generation enforced (`generateCanonicalGS1`)
- ✅ Unique serial generation per unit
- ✅ FNC1 standard enforced in ZPL/EPL outputs
- ✅ Company name embedded in GS1 payload (AI 93)
- ✅ No manual serial override possible in UI

### ✅ **Scanning Rules (Infrastructure)**
- ✅ Unit-level scan is free (no billing for unit scans)
- ✅ Unit scan allowed for any authenticated user
- ✅ Scan permission checks are in place (`/api/scan`)
- ✅ Duplicate scan detection exists in `/api/verify` (but not in `/api/scan`)

### ✅ **Multi-Tenant Isolation**
- ✅ All queries enforce `company_id` filtering
- ✅ RLS policies are correctly implemented
- ✅ Cross-company data access prevented

---

## 3️⃣ CRITICAL BLOCKERS

### 🔴 **BLOCKER 1: Expiry Status Not Evaluated in `/api/scan`**

**Area:** Scanner & Expiry Handling (Backend)  
**Location:** `app/api/scan/route.ts` (lines 398-410)

**Problem:**
- `/api/scan` does NOT check expiry date before logging scan
- `/api/verify` has `isExpired()` function (lines 23-50) but `/api/scan` does not use it
- Scan logs store `status: "SUCCESS"` even for expired products
- Expired products are treated as SUCCESS instead of ERROR

**Current State:**
```typescript
// app/api/scan/route.ts (line 401-410)
await supabase.from("scan_logs").insert({
  company_id,
  handset_id,
  raw_scan: raw,
  parsed: data,
  code_id: result?.id || null,
  scanned_at: new Date().toISOString(),
  metadata: { level },
  status: "SUCCESS"  // ❌ Always SUCCESS, never checks expiry
});
```

**Expected State (from `/api/verify`):**
```typescript
// app/api/verify/route.ts (lines 124-141) - This logic exists but NOT in /api/scan
if (expiry && isExpired(expiry)) {
  await supabase.from('scan_logs').insert({
    // ...
    metadata: { status: 'EXPIRED', reason: 'past_expiry_date', expiry },
    status: "ERROR"  // Should be ERROR, not SUCCESS
  });
}
```

**Business Impact:**
- Expired products marked as SUCCESS (compliance risk)
- No expiry visualization in scanner UI (operator cannot see product expired)
- Dashboard analytics incorrect (expired products counted as valid)
- Audit trail incomplete (expired products not distinguishable)

**Required Fix:**
1. Add expiry evaluation to `/api/scan` before logging:
   - Extract expiry from `data.expiryDate` (parsed GS1)
   - Call `isExpired()` function (same logic as `/api/verify`)
   - If expired: set `status: "ERROR"`, `metadata.status: "EXPIRED"`, `metadata.error_reason: "PRODUCT_EXPIRED"`
   - If valid: set `status: "SUCCESS"`, `metadata.status: "VALID"`, `metadata.expiry_status: "VALID"`

2. Store expiry status in scan_logs:
   - Add `metadata.expiry_status: "VALID" | "EXPIRED"` to all scans
   - Ensure expired products are always `status: "ERROR"` (never SUCCESS)

---

### 🔴 **BLOCKER 2: Scanner UI Missing Expiry Status Visualization**

**Area:** Scanner App & Dashboard (Frontend)  
**Locations:**
- Scanner mobile app UI (if exists)
- `app/dashboard/history/page.tsx` (scan history table)
- `app/dashboard/admin/page.tsx` (admin scan dashboard)

**Problem:**
- Scanner UI does not display green ✔ / red ❌ indicators for expiry status
- Scan history table shows status badges but not expiry status indicators
- No visual distinction between valid and expired products
- Expired products not highlighted in red

**Current State:**
- Scan history table shows status badges (VALID, DUPLICATE, EXPIRED, INVALID, ERROR)
- But NO expiry status indicators (green ✔ for valid, red ❌ for expired)
- Expiry date is displayed but not visually evaluated

**Business Impact:**
- Operators cannot quickly identify expired products (poor UX)
- Compliance risk (expired products not visually flagged)
- Dashboard analytics missing expiry breakdown

**Required Fix:**
1. **Add expiry evaluation to scan history display**:
   - Evaluate expiry at display time: `isExpired(scan.parsed?.expiryDate)`
   - Show green ✔ indicator for valid products
   - Show red ❌ indicator for expired products
   - Display status badge: "VALID PRODUCT" or "EXPIRED PRODUCT"

2. **Update scanner mobile app UI** (if exists):
   - Display green ✔ / red ❌ indicators on scan result screen
   - Show status label: "VALID PRODUCT" or "EXPIRED PRODUCT"
   - Display expiry date prominently
   - Ensure expired products are always visible (not hidden)

3. **Update dashboard scan history** (`app/dashboard/history/page.tsx`):
   - Add expiry status indicator column
   - Color-code rows: green for valid, red for expired
   - Group by expiry status in analytics

---

### 🔴 **BLOCKER 3: Settings Page Missing User Profile & Company Profile Editing**

**Area:** Settings Page (Frontend + Backend)  
**Location:** `app/dashboard/settings/page.tsx`

**Problem:**
- Settings page (`/dashboard/settings`) only contains ERP integration form
- **Missing sections:**
  - User Profile editing (Name, Phone)
  - Company Profile editing (Company Name, GST, PAN, Address)
  - Email change prevention UI (should show but disable email field)
  - User ID display (read-only)
  - Company ID display (read-only)

**Current State:**
- Page title: "Integrations" (not "Settings")
- Only ERP integration form is present
- No user profile or company profile editing capabilities

**Business Impact:**
- Users cannot update their profile information (name, phone)
- Users cannot update company information (GST, PAN, address) after initial setup
- Poor UX (settings page should allow profile management)

**Required Fix:**
1. **Add User Profile Section**:
   - Display current user email (read-only, disabled)
   - Display user ID (read-only, hidden or grayed out)
   - Editable fields: Full Name, Phone
   - API endpoint: `POST /api/user/profile/update` (needs to be created)

2. **Add Company Profile Section**:
   - Display company ID (read-only, hidden or grayed out)
   - Editable fields: Company Name, GST Number, PAN Number, Address
   - Non-editable fields: Email (ownership email), User ID (owner)
   - API endpoint: `POST /api/company/profile/update` (needs to be created)

3. **Backend Validation**:
   - Prevent email changes (enforce in API)
   - Prevent company_id changes (enforce in API)
   - Prevent user_id changes (enforce in API)
   - Validate GST/PAN format if applicable

4. **Update Page Title**:
   - Change page title from "Integrations" to "Settings"
   - Use tabs or sections: "User Profile", "Company Profile", "ERP Integration"

---

### 🔴 **BLOCKER 4: ERP Add-On Billing Violates Business Rules**

**Area:** Billing & Add-ons (Backend + Frontend)  
**Locations:**
- `app/api/addons/cart/create-order/route.ts`
- `app/api/addons/activate/route.ts`
- `app/api/razorpay/webhook/route.ts`
- `app/pricing/page.tsx`
- `app/api/integrations/save/route.ts`

**Problem:**
- ERP is being sold as a paid add-on (₹3,000/month per additional ERP integration)
- Business rule states: **"1 ERP integration per user_id = FREE"**
- Pricing page shows "Additional ERP integration" in add-ons table
- Integration limit check enforces `extra_erp_integrations` add-on purchase

**Business Impact:**
- Revenue model violation (should be free for first ERP per user)
- Customer confusion (why is first ERP free but shown as add-on?)
- Incorrect billing if customers purchase ERP add-on unnecessarily

**Required Fix:**
1. **Remove ERP from add-ons**:
   - Remove `"erp"` from `AddonKind` type
   - Remove `"erp"` from `ADDONS` array in `app/pricing/page.tsx`
   - Remove ERP add-on handling logic from `app/api/addons/activate/route.ts` and `app/api/razorpay/webhook/route.ts`

2. **Update ERP integration logic** (`app/api/integrations/save/route.ts`):
   - Change limit check to: "1 ERP per user_id (not company_id)"
   - Check: `SELECT COUNT(*) FROM integrations WHERE user_id = X` (from seats table)
   - Remove `extra_erp_integrations` column dependency
   - Allow first ERP per user_id for FREE

3. **Update pricing page messaging**:
   - Remove "Additional ERP integration" from add-ons section
   - Clarify: "1 ERP integration per User ID included (free)"

---

## 4️⃣ HIGH-RISK ISSUES

### 🟡 **HIGH 1: CSV Download Format Does Not Match CSV Upload Format**

**Area:** CSV Operations (Frontend)  
**Location:** `app/dashboard/products/page.tsx` (line 80-89)

**Problem:**
- **CSV Upload** (label generation): Accepts `GTIN`, `MFD`, `EXP`, `MRP`, `BATCH`, `SKU`, `COMPANY`, `QTY`
- **CSV Download** (SKU master): Only exports `sku_code`, `sku_name`
- Missing fields in download: `product_name`, `gtin`, `batch_no`, `mfd`, `expiry`, `mrp`, `serial`, `gs1_payload`, `company_name`, `fnc1_compliant`

**Business Rule Violation:**
- CSV download MUST include all fields needed for re-upload
- CSV must be re-upload compatible

**Current State:**
```typescript
// app/dashboard/products/page.tsx (line 83-86)
const rows = (skus ?? []).map((s) => ({
  sku_code: s.sku_code,
  sku_name: s.sku_name,  // ❌ Missing: gtin, batch, mfd, expiry, mrp, serial, gs1_payload, company_name
}));
```

**Expected State:**
- CSV download should include: `product_name` (sku_name), `sku_code`, `gtin`, `batch_no`, `mfd`, `expiry`, `mrp`, `serial`, `gs1_payload`, `company_name`, `fnc1_compliant`

**Business Impact:**
- CSV download cannot be used for re-upload (missing required fields)
- Users cannot bulk export labels with metadata
- Poor bulk export workflow

**Required Fix:**
1. **Enhance CSV download** for label exports:
   - Add CSV export option in label generation page (`/dashboard/generate`)
   - Include all required fields: `product_name`, `sku_code`, `gtin`, `batch_no`, `mfd`, `expiry`, `mrp`, `serial`, `gs1_payload`, `company_name`, `fnc1_compliant`
   - Ensure CSV format matches upload format

2. **Keep SKU master CSV simple** (as-is):
   - SKU master CSV (`sku_code`, `sku_name`) is correct for SKU-only exports
   - But label export CSV must include all label fields

---

### 🟡 **HIGH 2: ZIP Export Missing Metadata (Filenames & CSV Metadata File)**

**Area:** Export & File Generation (Frontend)  
**Location:** `lib/labelExporter.ts` (line 219-242)

**Problem:**
- ZIP export filenames are generic: `label_1_${label.id}.png`, `label_2_${label.id}.png`
- Missing SKU code, batch number, serial number in filenames
- No CSV metadata file included in ZIP
- Not usable for bulk identification without opening each file

**Current State:**
```typescript
// lib/labelExporter.ts (line 234)
zip.file(`label_${i + 1}_${label.id}.png`, blob);  // ❌ Generic filename
// ❌ No CSV metadata file added
```

**Expected State:**
```typescript
// Filenames should be: productName_batch_serial.png
const sku = label.metadata?.sku || 'N/A';
const batch = label.metadata?.batch || 'N/A';
const serial = label.metadata?.serial || label.id;
zip.file(`${sku}_${batch}_${serial}.png`, blob);

// Plus CSV metadata file:
zip.file('labels_metadata.csv', csvContent);
```

**Business Impact:**
- Users cannot identify labels from filenames alone
- Requires opening each PNG to see GS1 payload
- Poor bulk export UX for high-volume operations

**Required Fix:**
1. **Enhance ZIP filenames**:
   - Pattern: `productName_batch_serial.png` (or `sku_batch_serial.png`)
   - Extract SKU/batch/serial from `label.metadata` or `label.displayText`
   - Fallback to `label_${i + 1}_${label.id}.png` if metadata missing

2. **Add CSV metadata file to ZIP**:
   - Create `labels_metadata.csv` with columns: `filename`, `product_name`, `sku_code`, `batch`, `serial`, `gtin`, `gs1_payload`, `fnc1_status`
   - Add CSV file to ZIP archive
   - Makes bulk export searchable and auditable

---

### 🟡 **HIGH 3: Dashboard Scan Analytics Missing Expiry Breakdown**

**Area:** Dashboard Analytics (Frontend)  
**Location:** `app/dashboard/page.tsx` (lines 122-142)

**Problem:**
- Dashboard shows `total_scans` KPI but does not break down by expiry status
- No distinction between valid scans and expired scans
- Missing KPIs: "Valid Product Scans" (green), "Expired Product Scans" (red)

**Current State:**
- Dashboard KPI: `totalScans: stats.total_scans` (aggregate only)
- No expiry breakdown or visualization

**Expected State:**
- Dashboard should show:
  - Total Scans
  - Valid Product Scans (green) - `expiry_status: "VALID"`
  - Expired Product Scans (red) - `expiry_status: "EXPIRED"`
  - Duplicate Scans (yellow)
  - Error Scans (non-expiry errors)

**Business Impact:**
- Operators cannot quickly see how many expired products were scanned
- Compliance reporting incomplete (expired products not visible in dashboard)

**Required Fix:**
1. **Add expiry breakdown KPIs** to dashboard:
   - Query `scan_logs` filtered by `metadata->>'expiry_status'`
   - Display "Valid Product Scans" with green indicator
   - Display "Expired Product Scans" with red indicator
   - Show percentage breakdown

2. **Update dashboard stats API** (`/api/dashboard/stats`):
   - Include `valid_product_scans` count
   - Include `expired_product_scans` count
   - Include `duplicate_scans` count
   - Include `error_scans` count

---

### 🟡 **HIGH 4: GTIN Classification Not Implemented**

**Area:** GTIN Handling (Backend + Frontend)  
**Locations:**
- GTIN generation logic
- CSV upload/download
- UI displays

**Problem:**
- System does not classify GTINs as `GS1_ISSUED` vs `INTERNAL_NON_GS1`
- All GTINs treated equally (no distinction)
- No disclaimer shown for internal (non-GS1) GTINs
- Export disclaimers missing: "Internal (non-GS1) GTINs are valid for India only"

**Business Rule:**
- GTIN is OPTIONAL
- If GTIN not provided: System generates internal GS1-compatible identifier
- System must classify GTIN as: `GS1_ISSUED` or `INTERNAL_NON_GS1`
- UI + exports must show disclaimer for internal GTINs

**Business Impact:**
- Users may not know if GTIN is GS1-issued or internal (compliance risk)
- Export compliance unclear (internal GTINs may not be export-compliant)
- No visual distinction in UI between GS1-issued and internal GTINs

**Required Fix:**
1. **Add GTIN classification logic**:
   - Classify GTIN when generated or provided:
     - `GS1_ISSUED`: If GTIN provided by user (assumed GS1-issued)
     - `INTERNAL_NON_GS1`: If GTIN auto-generated by system
   - Store classification in database: `gtin_type: "GS1_ISSUED" | "INTERNAL_NON_GS1"`

2. **Add disclaimer in UI**:
   - Show warning badge: "⚠️ Internal (non-GS1) GTIN - Valid for India only" for internal GTINs
   - Display in label generation page, CSV exports, label previews

3. **Add disclaimer in exports**:
   - Include disclaimer in CSV exports: "Internal (non-GS1) GTINs are valid for India only and may not be export compliant"
   - Include in PDF/ZPL/EPL exports if possible

---

### 🟡 **HIGH 5: Product Naming Inconsistency (sku_name vs product_name)**

**Area:** Terminology & UI (Frontend)  
**Locations:**
- CSV upload/download
- UI displays
- API responses

**Problem:**
- Business rule states: "User-facing term = Product Name"
- `sku_name == Product Name` (database field)
- But CSV upload accepts `SKU` (not `PRODUCT_NAME`)
- CSV download exports `sku_name` (not `product_name`)
- Terminology inconsistent across system

**Current State:**
- CSV upload: Accepts `SKU` or `sku` (not `PRODUCT_NAME`)
- CSV download: Exports `sku_name` (not `product_name`)
- UI displays: Uses "SKU Master" (not "Product Master")

**Expected State:**
- CSV upload: Accept `PRODUCT_NAME` or `product_name` (and map to `sku_name` internally)
- CSV download: Export `product_name` (alias for `sku_name`)
- UI displays: Use "Product Name" terminology (not "SKU Name")

**Business Impact:**
- User confusion (what is "SKU" vs "Product Name"?)
- Terminology mismatch (business rule says "Product Name" but system uses "SKU")

**Required Fix:**
1. **Update CSV upload headers**:
   - Accept `PRODUCT_NAME` or `product_name` (in addition to `SKU_NAME`)
   - Map to `sku_name` internally (keep database field as-is)

2. **Update CSV download headers**:
   - Export as `product_name` (alias for `sku_name`)
   - Keep `sku_code` as-is (internal identifier)

3. **Update UI terminology**:
   - Change "SKU Master" to "Product Master" (or keep both)
   - Use "Product Name" in labels and forms (not "SKU Name")

---

## 5️⃣ MEDIUM-RISK ISSUES

### 🟢 **MEDIUM 1: Duplicate Scan Handling Inconsistent**

**Area:** Scanner & Duplicate Detection (Backend)  
**Locations:**
- `app/api/scan/route.ts` - No duplicate check
- `app/api/verify/route.ts` - Has duplicate check (lines 143-172)

**Problem:**
- `/api/scan` does NOT check for duplicate scans before logging
- `/api/verify` checks for duplicates correctly
- Inconsistent behavior between two scan endpoints

**Current State:**
- `/api/verify`: Checks duplicates, logs as `status: "DUPLICATE"`
- `/api/scan`: Always logs as `status: "SUCCESS"` (no duplicate check)

**Business Impact:**
- Duplicate scans may be logged multiple times in `/api/scan`
- Inconsistent scan behavior (depends on which endpoint is used)

**Required Fix:**
1. **Add duplicate check to `/api/scan`**:
   - Check if serial already scanned: `SELECT * FROM scan_logs WHERE parsed->>'serialNo' = serial`
   - If duplicate: log as `status: "DUPLICATE"`, `metadata.status: "DUPLICATE"`
   - If first scan: log as `status: "SUCCESS"`, `metadata.status: "VALID"`

---

### 🟢 **MEDIUM 2: CSV Upload Field Names Don't Match Business Rules**

**Area:** CSV Upload (Frontend)  
**Location:** `app/dashboard/generate/page.tsx` (line 162-236)

**Problem:**
- CSV upload accepts: `GTIN`, `MFD`, `EXP`, `MRP`, `BATCH`, `SKU`, `COMPANY`, `QTY`
- Business rule says user can provide: `product_name`, `sku_code`, `gtin`, `mrp`, `batch_no`, `mfd`, `expiry`
- Field names don't match (e.g., `EXP` vs `expiry`, `BATCH` vs `batch_no`, `SKU` vs `sku_code`)

**Current State:**
```typescript
// app/dashboard/generate/page.tsx (lines 167-174)
const gtinRaw = (row['GTIN'] || row['gtin'] || '').toString().trim();
const expRaw = (row['EXP'] || row['exp'] || '').toString().trim();
const batch = (row['BATCH'] || row['batch'] || '').toString().trim();
const sku = (row['SKU'] || row['sku'] || '').toString().trim();
```

**Expected State:**
- Accept flexible headers: `PRODUCT_NAME` / `product_name`, `SKU_CODE` / `sku_code`, `EXPIRY` / `expiry`, `BATCH_NO` / `batch_no`
- Map to internal field names for processing

**Business Impact:**
- Minor UX confusion (field names don't match business terminology)
- CSV template may need clarification

**Required Fix:**
1. **Update CSV upload to accept flexible headers**:
   - Accept `PRODUCT_NAME` / `product_name` → map to `sku_name`
   - Accept `SKU_CODE` / `sku_code` → map to `sku_code`
   - Accept `EXPIRY` / `expiry` → map to `exp` (in addition to `EXP`)
   - Accept `BATCH_NO` / `batch_no` → map to `batch` (in addition to `BATCH`)

2. **Provide CSV template download**:
   - Include sample CSV with correct headers
   - Document all accepted field names

---

### 🟢 **MEDIUM 3: Settings Page Title Misleading**

**Area:** Settings Page (Frontend)  
**Location:** `app/dashboard/settings/page.tsx` (line 33)

**Problem:**
- Page title is "Integrations" but URL is `/dashboard/settings`
- Sidebar link says "Settings" but page content says "Integrations"

**Business Impact:**
- Minor UX confusion (users expect "Settings" page to have settings)

**Required Fix:**
1. Change page title from "Integrations" to "Settings"
2. Keep ERP integration as a subsection within Settings

---

## 6️⃣ LOW-RISK ISSUES

### 🟢 **LOW 1: Redirect Pages Exist But May Cause Confusion**

**Area:** Navigation (Frontend)  
**Locations:**
- `app/dashboard/scans/page.tsx` → redirects to `/dashboard/history`
- `app/dashboard/sku/page.tsx` → redirects (need to check destination)
- `app/dashboard/packaging/page.tsx` → redirects (need to check destination)

**Problem:**
- Some dashboard routes are redirect pages instead of actual pages
- May cause slight navigation delay

**Business Impact:**
- Minimal (redirects are fast), but could be optimized

**Required Fix (Optional):**
- Consider using Next.js rewrites in `next.config.js` instead of redirect components
- Or consolidate routes to avoid redirects

---

## 7️⃣ REQUIRED FIXES (NO CODE - RECOMMENDATIONS)

### **Priority 1: Expiry Status Evaluation & Visualization**

**What to Add:**
1. **Backend (`/api/scan`)**:
   - Add `isExpired()` function call before logging scan
   - If expired: `status: "ERROR"`, `metadata.expiry_status: "EXPIRED"`, `metadata.error_reason: "PRODUCT_EXPIRED"`
   - If valid: `status: "SUCCESS"`, `metadata.expiry_status: "VALID"`

2. **Frontend (Dashboard & Scanner UI)**:
   - Add expiry status indicator column to scan history table
   - Show green ✔ for valid, red ❌ for expired
   - Display status badge: "VALID PRODUCT" or "EXPIRED PRODUCT"

3. **Dashboard Analytics**:
   - Add expiry breakdown KPIs: "Valid Product Scans" (green), "Expired Product Scans" (red)
   - Update stats API to include expiry breakdown

---

### **Priority 2: Settings Page Enhancement**

**What to Add:**
1. **User Profile Section**:
   - Editable: Full Name, Phone
   - Read-only: Email, User ID
   - API: `POST /api/user/profile/update`

2. **Company Profile Section**:
   - Editable: Company Name, GST Number, PAN Number, Address
   - Read-only: Company ID, Owner Email, Owner User ID
   - API: `POST /api/company/profile/update`

3. **Backend Validation**:
   - Prevent email/user_id/company_id changes
   - Validate GST/PAN format

4. **Page Layout**:
   - Change title to "Settings"
   - Use tabs or sections: "User Profile", "Company Profile", "ERP Integration"

---

### **Priority 3: Remove ERP Add-On Billing**

**What to Remove:**
1. `"erp"` from `AddonKind` type in `app/api/addons/cart/create-order/route.ts`
2. ERP add-on from `ADDONS` array in `app/pricing/page.tsx`
3. ERP add-on handling logic in `app/api/addons/activate/route.ts` and `app/api/razorpay/webhook/route.ts`

**What to Change:**
1. `/api/integrations/save`:
   - Change limit check to: "1 ERP per user_id (not company_id)"
   - Remove `extra_erp_integrations` column dependency
   - Allow first ERP per user_id for FREE

2. Pricing page:
   - Remove "Additional ERP integration" from add-ons table
   - Update messaging: "1 ERP integration per User ID included (free)"

---

### **Priority 4: CSV Download Format Enhancement**

**What to Add:**
1. **Label Export CSV** (separate from SKU master CSV):
   - Add CSV export option in label generation page
   - Include: `product_name`, `sku_code`, `gtin`, `batch_no`, `mfd`, `expiry`, `mrp`, `serial`, `gs1_payload`, `company_name`, `fnc1_compliant`

2. **Keep SKU Master CSV** (as-is):
   - `sku_code`, `sku_name` is correct for SKU-only exports

---

### **Priority 5: ZIP Export Metadata Enhancement**

**What to Add:**
1. **Enhanced filenames**:
   - Pattern: `productName_batch_serial.png` or `sku_batch_serial.png`
   - Extract from `label.metadata` or `label.displayText`

2. **CSV metadata file**:
   - Add `labels_metadata.csv` to ZIP
   - Columns: `filename`, `product_name`, `sku_code`, `batch`, `serial`, `gtin`, `gs1_payload`, `fnc1_status`

---

### **Priority 6: GTIN Classification Implementation**

**What to Add:**
1. **Classification logic**:
   - Classify GTIN when generated or provided: `GS1_ISSUED` vs `INTERNAL_NON_GS1`
   - Store `gtin_type` in database

2. **UI disclaimer**:
   - Show warning badge for internal GTINs: "⚠️ Internal (non-GS1) GTIN - Valid for India only"

3. **Export disclaimer**:
   - Include disclaimer in CSV exports and PDF/ZPL/EPL exports

---

### **Priority 7: Product Naming Terminology Consistency**

**What to Change:**
1. **CSV headers**:
   - Accept `PRODUCT_NAME` / `product_name` (in addition to `SKU_NAME`)
   - Export as `product_name` (alias for `sku_name`)

2. **UI terminology**:
   - Use "Product Name" in labels and forms (not "SKU Name")
   - Keep "SKU Master" page title or rename to "Product Master"

---

### **Priority 8: Duplicate Scan Check in `/api/scan`**

**What to Add:**
1. **Duplicate detection**:
   - Check if serial already scanned before logging
   - If duplicate: `status: "DUPLICATE"`, `metadata.status: "DUPLICATE"`
   - If first scan: `status: "SUCCESS"`

---

## 8️⃣ BUSINESS RULE COMPLIANCE MATRIX

| Business Rule | Status | Evidence |
|---------------|--------|----------|
| **Printers are FREE and UNLIMITED** | ✅ **ENFORCED** | No billing code, no limits in API |
| **Handsets are FREE and UNLIMITED** | ✅ **ENFORCED** | No billing calls in handset generation |
| **1 ERP per user_id = FREE** | 🔴 **VIOLATED** | ERP is sold as add-on, should be free |
| **Seat = user_id** | ✅ **ENFORCED** | `seats.user_id` in schema, UI enforces |
| **Unit scans are FREE** | ✅ **ENFORCED** | No billing for unit scans in `/api/scan` |
| **Expiry evaluation at scan time** | 🔴 **VIOLATED** | `/api/scan` does not check expiry |
| **Expiry status visualization** | 🔴 **MISSING** | No green ✔ / red ❌ indicators in UI |
| **GTIN classification (GS1_ISSUED vs INTERNAL)** | 🔴 **MISSING** | No classification logic found |
| **Product Name terminology** | ⚠️ **PARTIAL** | Uses `sku_name` instead of `product_name` |
| **CSV download matches CSV upload** | 🔴 **VIOLATED** | Missing required fields in download |
| **ZIP includes metadata** | 🔴 **VIOLATED** | Filenames lack SKU/batch/serial, no CSV metadata |
| **User can edit profile (name, phone)** | 🔴 **MISSING** | Settings page lacks user profile form |
| **User can edit company (GST, PAN, address)** | 🔴 **MISSING** | Settings page lacks company profile form |
| **Email/user_id/company_id cannot be changed** | ✅ **ENFORCED** | No API endpoints found that allow changes |
| **Duplicate scan handling** | ⚠️ **PARTIAL** | `/api/verify` handles, `/api/scan` does not |
| **Expired products visible (not hidden)** | ✅ **ENFORCED** | Expired scans are logged (but not evaluated in `/api/scan`) |

---

## 9️⃣ FINAL VERDICT

### ⚠️ **NOT FULLY PRODUCTION-READY FOR HIGH-VOLUME PHARMA USERS**

**Blockers (Must Fix Before Production):**
1. 🔴 Expiry status not evaluated in `/api/scan` (compliance risk)
2. 🔴 Scanner UI missing expiry visualization (operator UX)
3. 🔴 Settings page missing user/company profile editing (user needs)
4. 🔴 ERP add-on billing violates business rules (revenue model)

**High-Priority Issues (Fix Before High-Volume Rollout):**
5. 🟡 CSV download format incomplete (missing required fields)
6. 🟡 ZIP export lacks metadata (poor bulk export UX)
7. 🟡 Dashboard missing expiry breakdown (analytics incomplete)
8. 🟡 GTIN classification not implemented (compliance risk)
9. 🟡 Product naming inconsistency (terminology mismatch)

**Medium-Priority Issues (Fix for Polish):**
10. 🟢 Duplicate scan check missing in `/api/scan` (inconsistency)
11. 🟢 CSV upload field names don't match business rules
12. 🟢 Settings page title misleading

**Recommended Action Plan:**
1. **Fix Priority 1-4 immediately** (expiry evaluation, scanner UI, settings page, ERP billing)
2. **Fix Priority 5-9 before high-volume rollout** (CSV, ZIP, dashboard, GTIN, terminology)
3. **Fix Priority 10-12 as polish** (duplicate checks, field names, page titles)

**After Fixes:**
✅ System will be production-ready for high-volume pharma users.

---

**END OF REPORT**
