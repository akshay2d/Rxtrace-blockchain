# CODE ↔ DATABASE ALIGNMENT REPORT
**RxTrace – Multi-tenant Pharmaceutical Traceability Platform**

**Date:** 2025-01-20  
**Objective:** Verify application code aligns with verified database schema  
**Database Status:** ✅ FINAL & VERIFIED (DO NOT MODIFY)

---

## EXECUTIVE SUMMARY

### Verdict: ❌ **BLOCKERS REMAIN**

**Critical Issues Found:** 3  
**Risk Issues Found:** 5  
**Safe Components:** 8

---

## 1. PRIORITY 1 — GO-LIVE BLOCKERS (🔴 CRITICAL)

### 🔴 **BLOCKER #1: Missing Required Fields in `app/api/generate/commit/route.ts`**

**File:** `app/api/generate/commit/route.ts`  
**Lines:** 40-44  
**Severity:** 🔴 CRITICAL  
**Impact:** Database constraint violation, GS1 compliance failure

**Problem:**
```typescript
await supabase.from("labels_units").insert({
  job_id: job.id,  // ❌ Column doesn't exist in DB
  gs1_payload: gs1,
  serial
  // ❌ MISSING: company_id (UUID NOT NULL)
  // ❌ MISSING: gtin (TEXT NOT NULL)
  // ❌ MISSING: batch (TEXT NOT NULL)
  // ❌ MISSING: mfd (TEXT NOT NULL)
  // ❌ MISSING: expiry (TEXT NOT NULL)
});
```

**Database Requirements:**
- `company_id UUID NOT NULL` (required)
- `gtin TEXT NOT NULL` (required)
- `batch TEXT NOT NULL` (required)
- `mfd TEXT NOT NULL` (required)
- `expiry TEXT NOT NULL` (required)
- `serial TEXT NOT NULL` (provided ✅)
- `gs1_payload TEXT NOT NULL` (provided ✅)
- `job_id` column does NOT exist in verified schema

**Required Fix:**
```typescript
await supabase.from("labels_units").insert({
  company_id: company.id,  // ✅ Add from body.company
  gtin,                     // ✅ Add from body
  batch,                    // ✅ Add from body
  mfd,                      // ✅ Add from body
  expiry: exp,              // ✅ Add from body
  serial,
  gs1_payload: gs1,
  sku_id: sku.id,          // ✅ Optional but recommended
  mrp: mrp                  // ✅ Optional
});
```

**Also Remove:**
- `job_id` field (column doesn't exist in verified schema)

---

### 🔴 **BLOCKER #2: Missing `company_id` Filter in `app/api/reports/recall/route.ts`**

**File:** `app/api/reports/recall/route.ts`  
**Lines:** 71-79  
**Severity:** 🔴 CRITICAL  
**Impact:** Cross-company data leakage, RLS bypass risk

**Problem:**
```typescript
let unitQuery = supabase
  .from("labels_units")
  .select("unit_code, gtin, sku, batch");
  // ❌ MISSING: .eq("company_id", companyId)

if (batch) unitQuery = unitQuery.eq("batch", batch);
if (sku) unitQuery = unitQuery.eq("sku", sku);
if (gtin) unitQuery = unitQuery.eq("gtin", gtin);
```

**Database Requirements:**
- All queries on `labels_units` MUST filter by `company_id` for multi-tenant isolation
- RLS policies enforce this, but code should be explicit
- Missing filter could expose other companies' data if RLS misconfigured

**Required Fix:**
```typescript
let unitQuery = supabase
  .from("labels_units")
  .select("id, serial, gtin, batch, mfd, expiry, created_at")  // ✅ Fix column names
  .eq("company_id", companyId);  // ✅ Add company filter FIRST

if (batch) unitQuery = unitQuery.eq("batch", batch);
if (gtin) unitQuery = unitQuery.eq("gtin", gtin);
// Note: sku filter should use sku_id (UUID), not sku (string)
```

**Additional Issues:**
- Line 73: Column `unit_code` doesn't exist → should be `serial`
- Line 73: Column `sku` doesn't exist → should query via `sku_id` join or filter
- Line 76: Filtering by `sku` (string) but column doesn't exist

---

### 🔴 **BLOCKER #3: Missing `company_id` in Hierarchy Queries (`app/api/scan/route.ts`)**

**File:** `app/api/scan/route.ts`  
**Lines:** 36-42, 190-196, 235-239  
**Severity:** 🔴 CRITICAL  
**Impact:** Potential cross-company data access in hierarchy building

**Problem:**
```typescript
// Line 36-42: buildHierarchyForPallet function
const { data: units } = boxIds.length
  ? await supabase
      .from("labels_units")
      .select("id, box_id, serial, created_at")
      .in("box_id", boxIds)
      // ❌ MISSING: .eq("company_id", companyId)
      .order("created_at", { ascending: true })
  : { data: [] as any[] };
```

**Database Requirements:**
- All queries MUST filter by `company_id` for security
- Even when filtering by `box_id`, should add `company_id` for defense-in-depth

**Required Fix:**
```typescript
// Add company_id parameter to buildHierarchyForPallet
async function buildHierarchyForPallet(opts: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  palletId: string;
  companyId: string;  // ✅ Add company_id parameter
}) {
  // ... existing code ...
  
  const { data: units } = boxIds.length
    ? await supabase
        .from("labels_units")
        .select("id, box_id, serial, created_at")
        .eq("company_id", opts.companyId)  // ✅ Add filter
        .in("box_id", boxIds)
        .order("created_at", { ascending: true })
    : { data: [] as any[] };
}
```

**Affected Locations:**
- Line 36-42: `buildHierarchyForPallet` function
- Line 190-196: Carton hierarchy query
- Line 235-239: Box hierarchy query
- Line 169: Call to `buildHierarchyForPallet` (needs `companyId` parameter)

---

## 2. PRIORITY 2 — PRE-SCALE REQUIREMENTS (🟡 RISK)

### 🟡 **RISK #1: Missing `company_id` Filter in `app/api/search/route.ts`**

**File:** `app/api/search/route.ts`  
**Lines:** 56-62, 136-140, 177-180  
**Severity:** 🟡 MEDIUM  
**Impact:** Performance degradation, potential RLS bypass

**Problem:**
```typescript
// Line 56-62: buildHierarchyForPallet (same issue as scan/route.ts)
const { data: units } = boxIds.length
  ? await supabase
      .from("labels_units")
      .select("id, box_id, serial, created_at")
      .in("box_id", boxIds)
      // ❌ MISSING: .eq("company_id", companyId)
      .order("created_at", { ascending: true })
  : { data: [] as any[] };
```

**Required Fix:**
- Same as BLOCKER #3: Add `companyId` parameter to `buildHierarchyForPallet`
- Add `.eq("company_id", companyId)` to all `labels_units` queries

---

### 🟡 **RISK #2: Column Name Mismatch in `app/api/reports/recall/route.ts`**

**File:** `app/api/reports/recall/route.ts`  
**Lines:** 73, 136, 150-158  
**Severity:** 🟡 MEDIUM  
**Impact:** Query returns no data, incorrect field names

**Problem:**
```typescript
// Line 73: Wrong column names
.select("unit_code, gtin, sku, batch");
// ❌ unit_code doesn't exist → should be serial
// ❌ sku doesn't exist → should query via sku_id

// Line 136: Wrong field reference
const unitCode = unit.unit_code;  // ❌ unit_code doesn't exist
```

**Database Schema:**
- `labels_units.serial` (not `unit_code`)
- `labels_units.sku_id` (UUID, not `sku` string)
- No `unit_code` column exists

**Required Fix:**
```typescript
// Line 73: Fix column selection
.select("id, serial, gtin, batch, mfd, expiry, sku_id, created_at");

// Line 136: Fix field reference
const unitSerial = unit.serial;  // ✅ Use serial instead of unit_code

// Line 150-158: Update results mapping
results.push({
  serial: unitSerial,  // ✅ Use serial
  gtin: unit.gtin,
  sku_id: unit.sku_id,  // ✅ Use sku_id (may need join for sku_code)
  batch: unit.batch,
  box,
  carton,
  pallet: palletCode,
});
```

---

### 🟡 **RISK #3: Missing `company_id` Validation in Hierarchy Queries**

**File:** `app/api/scan/route.ts`, `app/api/search/route.ts`  
**Lines:** Multiple hierarchy building functions  
**Severity:** 🟡 MEDIUM  
**Impact:** Performance, potential security risk

**Problem:**
When building hierarchy (pallet → cartons → boxes → units), queries don't validate that all items belong to the same company.

**Example:**
```typescript
// Line 20-24: Cartons query doesn't verify company_id
const { data: cartons } = await supabase
  .from("cartons")
  .select("id, pallet_id, sscc, sscc_with_ai, code, sku_id, created_at, meta")
  .eq("pallet_id", palletId)
  // ❌ MISSING: .eq("company_id", companyId)
  .order("created_at", { ascending: true });
```

**Required Fix:**
Add `company_id` filter to all hierarchy queries:
- Cartons query (line 20-24)
- Boxes query (line 27-33)
- Units query (line 36-42)

---

### 🟡 **RISK #4: Missing `scanned_at` Column in `app/api/scan/route.ts`**

**File:** `app/api/scan/route.ts`  
**Lines:** 393-400, 308-321  
**Severity:** 🟡 LOW  
**Impact:** Missing timestamp data

**Problem:**
```typescript
await supabase.from("scan_logs").insert({
  company_id,
  handset_id,
  raw_scan: raw,
  parsed: data,
  metadata: { level },
  status: "SUCCESS"
  // ❌ MISSING: scanned_at (has DEFAULT NOW() but should be explicit)
});
```

**Database Schema:**
- `scanned_at TIMESTAMPTZ DEFAULT NOW()` (has default, but explicit is better)
- `created_at TIMESTAMPTZ DEFAULT NOW()` (has default)

**Required Fix:**
```typescript
await supabase.from("scan_logs").insert({
  company_id,
  handset_id,
  raw_scan: raw,
  parsed: data,
  metadata: { level },
  status: "SUCCESS",
  scanned_at: new Date().toISOString()  // ✅ Explicit timestamp
});
```

**Note:** This is low priority since DB has DEFAULT, but explicit is better for audit trails.

---

### 🟡 **RISK #5: Potential Missing `code_id` in Scan Logs**

**File:** `app/api/scan/route.ts`  
**Lines:** 393-400  
**Severity:** 🟡 LOW  
**Impact:** Missing traceability link

**Problem:**
```typescript
await supabase.from("scan_logs").insert({
  company_id,
  handset_id,
  raw_scan: raw,
  parsed: data,
  metadata: { level },
  status: "SUCCESS"
  // ❌ MISSING: code_id (should link to unit/box/carton/pallet.id)
});
```

**Database Schema:**
- `code_id UUID` (nullable, but should be populated for traceability)

**Required Fix:**
```typescript
await supabase.from("scan_logs").insert({
  company_id,
  handset_id,
  raw_scan: raw,
  parsed: data,
  metadata: { level },
  status: "SUCCESS",
  code_id: result?.id || null  // ✅ Link to scanned item
});
```

---

## 3. SAFE COMPONENTS (✅ VERIFIED)

### ✅ **`app/api/unit/create/route.ts`**
- ✅ Includes `company_id` in all queries and inserts
- ✅ Includes all required fields: `company_id`, `gtin`, `batch`, `mfd`, `expiry`, `serial`, `gs1_payload`
- ✅ Handles uniqueness constraint violation (error code 23505)
- ✅ Uses canonical GS1 generation
- ✅ Proper error handling and rollback

### ✅ **`app/api/box/create/route.ts`**
- ✅ Includes `company_id` in all queries and inserts
- ✅ Proper company-scoped queries for units
- ✅ Correct foreign key relationships

### ✅ **`app/api/carton/create/route.ts`**
- ✅ Includes `company_id` in all queries and inserts
- ✅ Proper company-scoped queries for boxes
- ✅ Correct foreign key relationships

### ✅ **`app/api/pallet/create/route.ts`**
- ✅ Includes `company_id` in all queries and inserts
- ✅ Proper company-scoped queries for cartons
- ✅ Correct foreign key relationships

### ✅ **`app/api/scan/route.ts` (Partial)**
- ✅ Main scan query filters by `company_id` (line 164, 178, 230, 273)
- ✅ Scan log insert includes `company_id` (line 393)
- ✅ Payload validation logic is correct
- ⚠️ Hierarchy building functions need `company_id` filters (see BLOCKER #3)

### ✅ **`lib/audit.ts`**
- ✅ `writeAuditLog` includes `company_id` in insert
- ✅ All required fields present

### ✅ **`lib/gs1Canonical.ts`**
- ✅ Canonical GS1 generation is correct
- ✅ All mandatory AIs validated
- ✅ Machine format with FNC1 separators

### ✅ **`app/api/search/route.ts` (Partial)**
- ✅ Main search queries filter by `company_id` (line 111, 171, 212)
- ⚠️ Hierarchy building functions need `company_id` filters (see RISK #1)

---

## 4. FILE-BY-FILE ALIGNMENT DETAILS

### `app/api/unit/create/route.ts`
**Status:** ✅ **ALIGNED** (with minor note)

**Verified:**
- ✅ Line 147-157: Insert includes all required fields
- ✅ Line 109-116: Uniqueness check includes `company_id`
- ✅ Line 161: Bulk insert with all required fields
- ✅ Line 164: Handles uniqueness constraint violation

**Note:**
- Retry logic (line 99-125) is good practice but DB constraint will catch duplicates anyway

---

### `app/api/box/create/route.ts`
**Status:** ✅ **ALIGNED**

**Verified:**
- ✅ Line 192: Insert includes `company_id`
- ✅ Line 119-125: Unit query filters by `company_id`
- ✅ Line 252-256: Unit update includes company scope (via `box_id` relationship)

---

### `app/api/carton/create/route.ts`
**Status:** ✅ **ALIGNED**

**Verified:**
- ✅ Line 217: Insert includes `company_id`
- ✅ Line 143-150: Box query filters by `company_id`
- ✅ Line 276-281: Box update includes company scope

---

### `app/api/pallet/create/route.ts`
**Status:** ✅ **ALIGNED**

**Verified:**
- ✅ Line 190: Insert includes `company_id`
- ✅ Line 116-123: Carton query filters by `company_id`
- ✅ Line 245-250: Carton update includes company scope

---

### `app/api/scan/route.ts`
**Status:** ⚠️ **PARTIALLY ALIGNED** (see BLOCKER #3)

**Verified:**
- ✅ Line 164: Pallet query filters by `company_id`
- ✅ Line 178: Carton query filters by `company_id`
- ✅ Line 230: Box query filters by `company_id`
- ✅ Line 273: Unit query filters by `company_id`
- ✅ Line 393: Scan log insert includes `company_id`

**Issues:**
- ❌ Line 36-42: `buildHierarchyForPallet` doesn't filter units by `company_id`
- ❌ Line 190-196: Carton hierarchy query doesn't filter units by `company_id`
- ❌ Line 235-239: Box hierarchy query doesn't filter units by `company_id`

---

### `app/api/search/route.ts`
**Status:** ⚠️ **PARTIALLY ALIGNED** (see RISK #1)

**Verified:**
- ✅ Line 111: Pallet query filters by `company_id`
- ✅ Line 171: Box query filters by `company_id`
- ✅ Line 212: Unit query filters by `company_id`

**Issues:**
- ❌ Line 56-62: `buildHierarchyForPallet` doesn't filter units by `company_id`
- ❌ Line 136-140: Carton hierarchy query doesn't filter units by `company_id`
- ❌ Line 177-180: Box hierarchy query doesn't filter units by `company_id`

---

### `app/api/generate/commit/route.ts`
**Status:** ❌ **NOT ALIGNED** (see BLOCKER #1)

**Critical Issues:**
- ❌ Line 40-44: Insert missing `company_id`, `gtin`, `batch`, `mfd`, `expiry`
- ❌ Line 41: `job_id` column doesn't exist in verified schema
- ❌ Missing required NOT NULL fields will cause constraint violation

**Required Changes:**
1. Add all required fields to insert
2. Remove `job_id` field
3. Get `company_id` from `body.company.id`

---

### `app/api/reports/recall/route.ts`
**Status:** ❌ **NOT ALIGNED** (see BLOCKER #2)

**Critical Issues:**
- ❌ Line 71-79: Query doesn't filter by `company_id`
- ❌ Line 73: Wrong column names (`unit_code`, `sku` don't exist)
- ❌ Line 136: Wrong field reference (`unit.unit_code`)

**Required Changes:**
1. Add `.eq("company_id", companyId)` to unit query
2. Fix column selection: use `serial` instead of `unit_code`
3. Fix SKU filtering: use `sku_id` join or filter
4. Update field references throughout

---

### `lib/audit.ts`
**Status:** ✅ **ALIGNED**

**Verified:**
- ✅ Line 19: Insert includes `company_id`
- ✅ All required fields present
- ✅ Correct field names

---

## 5. EXACT CODE CHANGES REQUIRED

### Change #1: Fix `app/api/generate/commit/route.ts`

**Location:** Lines 40-44

**Current Code:**
```typescript
await supabase.from("labels_units").insert({
  job_id: job.id,
  gs1_payload: gs1,
  serial
});
```

**Fixed Code:**
```typescript
await supabase.from("labels_units").insert({
  company_id: company.id,
  sku_id: sku.id,
  gtin,
  batch,
  mfd,
  expiry: exp,
  mrp: mrp || null,
  serial,
  gs1_payload: gs1
});
```

---

### Change #2: Fix `app/api/reports/recall/route.ts`

**Location:** Lines 71-79

**Current Code:**
```typescript
let unitQuery = supabase
  .from("labels_units")
  .select("unit_code, gtin, sku, batch");

if (batch) unitQuery = unitQuery.eq("batch", batch);
if (sku) unitQuery = unitQuery.eq("sku", sku);
if (gtin) unitQuery = unitQuery.eq("gtin", gtin);
```

**Fixed Code:**
```typescript
let unitQuery = supabase
  .from("labels_units")
  .select("id, serial, gtin, batch, mfd, expiry, sku_id, created_at")
  .eq("company_id", companyId);  // ✅ Add company filter FIRST

if (batch) unitQuery = unitQuery.eq("batch", batch);
if (gtin) unitQuery = unitQuery.eq("gtin", gtin);
// Note: SKU filtering requires join or sku_id filter
if (sku) {
  // Resolve sku_id from sku_code first, then filter
  const { data: skuRow } = await supabase
    .from("skus")
    .select("id")
    .eq("company_id", companyId)
    .eq("sku_code", sku.toUpperCase())
    .maybeSingle();
  if (skuRow?.id) {
    unitQuery = unitQuery.eq("sku_id", skuRow.id);
  }
}
```

**Location:** Line 136

**Current Code:**
```typescript
const unitCode = unit.unit_code;
```

**Fixed Code:**
```typescript
const unitSerial = unit.serial;
```

**Location:** Lines 150-158

**Current Code:**
```typescript
results.push({
  unit_code: unitCode,
  gtin: unit.gtin,
  sku: unit.sku,
  batch: unit.batch,
  box,
  carton,
  pallet: palletCode,
});
```

**Fixed Code:**
```typescript
results.push({
  serial: unitSerial,
  gtin: unit.gtin,
  sku_id: unit.sku_id,  // Note: May need join for sku_code display
  batch: unit.batch,
  box,
  carton,
  pallet: palletCode,
});
```

---

### Change #3: Fix `app/api/scan/route.ts` Hierarchy Queries

**Location:** Lines 7-68 (function signature and implementation)

**Current Code:**
```typescript
async function buildHierarchyForPallet(opts: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  palletId: string;
}) {
```

**Fixed Code:**
```typescript
async function buildHierarchyForPallet(opts: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  palletId: string;
  companyId: string;  // ✅ Add company_id parameter
}) {
```

**Location:** Lines 20-24

**Current Code:**
```typescript
const { data: cartons } = await supabase
  .from("cartons")
  .select("id, pallet_id, sscc, sscc_with_ai, code, sku_id, created_at, meta")
  .eq("pallet_id", palletId)
  .order("created_at", { ascending: true });
```

**Fixed Code:**
```typescript
const { data: cartons } = await supabase
  .from("cartons")
  .select("id, pallet_id, sscc, sscc_with_ai, code, sku_id, created_at, meta")
  .eq("company_id", opts.companyId)  // ✅ Add company filter
  .eq("pallet_id", palletId)
  .order("created_at", { ascending: true });
```

**Location:** Lines 27-33

**Current Code:**
```typescript
const { data: boxes } = cartonIds.length
  ? await supabase
      .from("boxes")
      .select("id, carton_id, pallet_id, sscc, sscc_with_ai, code, sku_id, created_at, meta")
      .in("carton_id", cartonIds)
      .order("created_at", { ascending: true })
  : { data: [] as any[] };
```

**Fixed Code:**
```typescript
const { data: boxes } = cartonIds.length
  ? await supabase
      .from("boxes")
      .select("id, carton_id, pallet_id, sscc, sscc_with_ai, code, sku_id, created_at, meta")
      .eq("company_id", opts.companyId)  // ✅ Add company filter
      .in("carton_id", cartonIds)
      .order("created_at", { ascending: true })
  : { data: [] as any[] };
```

**Location:** Lines 36-42

**Current Code:**
```typescript
const { data: units } = boxIds.length
  ? await supabase
      .from("labels_units")
      .select("id, box_id, serial, created_at")
      .in("box_id", boxIds)
      .order("created_at", { ascending: true })
  : { data: [] as any[] };
```

**Fixed Code:**
```typescript
const { data: units } = boxIds.length
  ? await supabase
      .from("labels_units")
      .select("id, box_id, serial, created_at")
      .eq("company_id", opts.companyId)  // ✅ Add company filter
      .in("box_id", boxIds)
      .order("created_at", { ascending: true })
  : { data: [] as any[] };
```

**Location:** All calls to `buildHierarchyForPallet` (lines 169, 213, 251, 295)

**Current Code:**
```typescript
result = await buildHierarchyForPallet({ supabase, palletId: palletRow.id });
```

**Fixed Code:**
```typescript
result = await buildHierarchyForPallet({ 
  supabase, 
  palletId: palletRow.id,
  companyId: company_id  // ✅ Add company_id
});
```

**Location:** Lines 190-196, 235-239 (similar hierarchy queries)

**Apply same pattern:** Add `.eq("company_id", company_id)` to all `labels_units` queries in hierarchy building.

---

### Change #4: Fix `app/api/search/route.ts` Hierarchy Queries

**Apply same fixes as Change #3:**
- Add `companyId` parameter to `buildHierarchyForPallet`
- Add `.eq("company_id", companyId)` to all hierarchy queries
- Pass `companyId` in all function calls

---

### Change #5: Enhance Scan Logs (Optional but Recommended)

**Location:** `app/api/scan/route.ts` Lines 393-400, 308-321

**Current Code:**
```typescript
await supabase.from("scan_logs").insert({
  company_id,
  handset_id,
  raw_scan: raw,
  parsed: data,
  metadata: { level },
  status: "SUCCESS"
});
```

**Enhanced Code:**
```typescript
await supabase.from("scan_logs").insert({
  company_id,
  handset_id,
  raw_scan: raw,
  parsed: data,
  metadata: { level },
  status: "SUCCESS",
  code_id: result?.id || null,  // ✅ Link to scanned item
  scanned_at: new Date().toISOString()  // ✅ Explicit timestamp
});
```

---

## 6. SUMMARY OF REQUIRED FIXES

### Priority 1 (Must Fix Before Production)

1. ✅ **`app/api/generate/commit/route.ts`**
   - Add `company_id`, `gtin`, `batch`, `mfd`, `expiry` to insert
   - Remove `job_id` field

2. ✅ **`app/api/reports/recall/route.ts`**
   - Add `.eq("company_id", companyId)` to unit query
   - Fix column names: `serial` instead of `unit_code`
   - Fix SKU filtering logic

3. ✅ **`app/api/scan/route.ts`**
   - Add `companyId` parameter to `buildHierarchyForPallet`
   - Add `.eq("company_id", companyId)` to all hierarchy queries

### Priority 2 (Should Fix Before Scale)

4. ✅ **`app/api/search/route.ts`**
   - Same fixes as `scan/route.ts` for hierarchy queries

5. ✅ **`app/api/scan/route.ts`** (Enhancement)
   - Add `code_id` and `scanned_at` to scan log inserts

---

## 7. TESTING CHECKLIST

After applying fixes, verify:

- [ ] Unit generation includes all required fields
- [ ] Recall report only shows current company's data
- [ ] Scan hierarchy queries are company-scoped
- [ ] Search queries are company-scoped
- [ ] No database constraint violations occur
- [ ] RLS policies work correctly with code changes
- [ ] GS1 payload validation works
- [ ] Scan logs include proper traceability links

---

## 8. FINAL VERDICT

### ❌ **BLOCKERS REMAIN**

**Status:** Not production-ready until Priority 1 fixes are applied.

**Estimated Fix Time:** 2-4 hours

**Risk Level:** 🔴 HIGH (data leakage, constraint violations)

**Recommendation:** Apply all Priority 1 fixes immediately before any production deployment.

---

**END OF REPORT**
