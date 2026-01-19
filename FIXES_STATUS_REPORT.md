# RxTrace Critical Fixes - Status Report

**Date:** 2025-01-20  
**Issues Identified:** 5 Critical Functional Gaps

---

## 🚨 **ISSUE 5: API Response Error Handling** (CRITICAL - BLOCKED)

**Problem:** Unit-level code generation fails with "Unexpected end of JSON input" when API returns empty response.

**Root Cause:** 
- Frontend calls `/api/issues` but **THIS ENDPOINT DOES NOT EXIST** in the codebase
- Frontend calls `res.json()` without checking if response has content or is valid JSON

**Discovery:**
- ❌ `/api/issues` route does NOT exist
- ✅ `/api/unit/create` exists (requires company_id, different payload structure)
- ❓ `/api/labels/generate` exists (different purpose)

**Status:** ⚠️ **STOP CONDITION - BACKEND ENDPOINT MISSING**

**Required Backend Action:**
1. **Create `/api/issues` endpoint** OR
2. **Update frontend** to use `/api/unit/create` (will require payload restructuring)

**Frontend Code Locations:**
- `app/dashboard/code-generation/unit/page.tsx` (lines 190, 328)
- `app/dashboard/generate/page.tsx` (line 195)

**Action Required (STOP):**
⚠️ **MUST CREATE `/api/issues` ENDPOINT OR REFACTOR FRONTEND TO USE EXISTING ENDPOINT**

**Cannot proceed with fix until backend endpoint is created/confirmed.**

---

## 📋 **ISSUE 1: Company Setup/Edit Flow Broken**

**Problem:** 
- Billing page redirects to `/dashboard/settings` for company setup
- No dedicated company setup page exists
- Settings page may not handle company creation

**Required Fix:**
- Create `/dashboard/company-setup` page
- Support both creation and edit modes
- Update billing page links to use new route

**Status:** 🔄 **AWAITING IMPLEMENTATION**

**Backend API Status:** ✅ `/api/setup/create-company-profile` exists
**Backend API Status:** ✅ `/api/company/profile/update` exists

**Action Required:**
1. Create `app/dashboard/company-setup/page.tsx`
2. Implement create/edit logic based on company existence
3. Update billing page links (lines 408, 416)
4. Ensure Settings page doesn't block creation

---

## 📋 **ISSUE 2: Manual SKU Creation Missing**

**Problem:** 
- No UI for manual SKU creation
- Users forced to use CSV import only
- Modal exists but only supports "edit" mode

**Required Fix:**
- Add "Create SKU" button in SKU Master page
- Enable modal in "create" mode
- Allow SKU code entry during creation

**Status:** 🔄 **AWAITING IMPLEMENTATION**

**Backend API Status:** ✅ `/api/skus` POST endpoint exists

**Action Required:**
1. Add "Create SKU" button to SKU Master page
2. Enable `modalMode: 'create'` functionality
3. Update `handleSubmit` to support creation (remove `if (!editingSku) return;` check)
4. Allow SKU code input during creation (currently disabled in edit mode)

---

## 📋 **ISSUE 3: SSCC Quantity Definition Unclear**

**Problem:**
- SSCC CSV format doesn't clearly define quantity
- Users confused how many SSCCs will be generated

**Required Fix:**
- Document: "One SSCC is generated per pallet"
- Update SSCC CSV template documentation
- Add validation message if "Number of Pallets" is missing/zero

**Status:** 🔄 **AWAITING IMPLEMENTATION**

**Files to Update:**
- `app/dashboard/code-generation/sscc/page.tsx`
- SSCC CSV template documentation

**Action Required:**
1. Update UI helper text
2. Add validation for "Number of Pallets" column
3. Clarify in CSV template documentation

---

## 📋 **ISSUE 4: ERP Integration - No API Generation Method**

**Problem:**
- ERP integration referenced but no API exists
- No documentation on how to generate API tokens/keys

**Required Action:**
- Option A: Add placeholder UI with "Coming Soon" message
- Option B: Define minimal ERP API contract
- Option C: Remove broken ERP references from billing if backend not ready

**Status:** 🔍 **REQUIRES INVESTIGATION**

**Action Required:**
1. Check current ERP integration references in codebase
2. Determine if backend ERP API exists
3. If not: Add placeholder or remove references
4. If yes: Document API token generation method

---

## 🚨 **STOP CONDITIONS**

**Before implementing fixes:**

1. **Issue 5 (API Response):**
   - ⚠️ **MUST CONFIRM:** Correct endpoint for unit code generation (`/api/issues` vs `/api/unit/create`)

2. **Issue 4 (ERP Integration):**
   - ⚠️ **MUST DETERMINE:** Does ERP API backend exist? If not, use placeholder or remove references.

---

## 📊 **PRIORITY SUMMARY**

| Issue | Priority | Status | Blocking |
|-------|----------|--------|----------|
| #5: API Response Error | CRITICAL | ⚠️ Needs Endpoint Confirmation | Yes |
| #1: Company Setup Page | HIGH | 🔄 Ready to Implement | No |
| #2: Manual SKU Creation | HIGH | 🔄 Ready to Implement | No |
| #3: SSCC Quantity Clarity | MEDIUM | 🔄 Ready to Implement | No |
| #4: ERP Integration | MEDIUM | 🔍 Needs Investigation | No |

---

**Next Steps:**
1. Confirm correct unit code generation API endpoint
2. Check ERP integration backend status
3. Proceed with implementations once confirmed
