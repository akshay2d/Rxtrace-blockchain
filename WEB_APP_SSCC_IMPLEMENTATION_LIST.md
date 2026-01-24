# Web Application - SSCC Scanning Activation Implementation List

**Date:** 2026-01-23  
**Status:** Planning Phase

---

## 📋 Overview

This document lists all implementation requirements in the **web application** to support SSCC scanning activation using the new company-based registration flow (via `/api/handset/register-lite`).

**Key Change:** Mobile app now calls `/api/handset/register-lite` directly with `company_id` - no token generation needed from web UI.

---

## ✅ Current State Analysis

### What Exists:
1. ✅ Token generation UI (`/app/dashboard/admin/handsets/page.tsx`)
2. ✅ Token generation API (`/api/admin/handset-tokens`)
3. ✅ Handset management API (`/api/admin/handsets`)
4. ✅ Scanner settings API (`/api/admin/scanner-settings`)
5. ✅ Handset listing/display

### What Needs Change:
1. ❌ Remove/hide token generation UI (user mentioned they removed it)
2. ❌ Update handset management to show register-lite handsets
3. ❌ Add company validation in register-lite endpoint
4. ❌ Update handset display to show registration method
5. ❌ Add handset deactivation/management features

---

## 🎯 Implementation Tasks

### **Task 1: Update `/api/handset/register-lite` Endpoint**

**File:** `app/api/handset/register-lite/route.ts`

**Current Issues:**
- ❌ No company validation
- ❌ No duplicate device fingerprint check per company
- ❌ Sets `high_scan_enabled: false` (should be `true`)
- ❌ Sets `role: "UNIT_ONLY"` (should be full access)
- ❌ Returns `token` instead of `jwt`
- ❌ No rate limiting

**Required Changes:**
1. **Validate company_id exists and is active**
   ```typescript
   // Check company exists
   const company = await prisma.companies.findUnique({
     where: { id: company_id }
   });
   if (!company) {
     return NextResponse.json({ success: false, error: "Invalid company_id" }, { status: 400 });
   }
   ```

2. **Check for duplicate device fingerprint per company**
   ```typescript
   // Check if device already registered for this company
   const existing = await prisma.handsets.findFirst({
     where: {
       company_id,
       device_fingerprint
     }
   });
   if (existing) {
     // Return existing JWT instead of creating new
     const jwt = generateJWT(existing.id, company_id);
     return NextResponse.json({ success: true, jwt, handset_id: existing.id });
   }
   ```

3. **Set correct defaults**
   ```typescript
   high_scan_enabled: true,  // Full SSCC access
   status: "ACTIVE"
   ```

4. **Update JWT payload**
   ```typescript
   const jwt = jwt.sign({
     handset_id: handset.id,
     company_id,
     role: "FULL_ACCESS",  // or omit for default full access
     high_scan: true
   }, process.env.JWT_SECRET!, { expiresIn: "180d" });
   ```

5. **Add rate limiting**
   ```typescript
   // Max 10 registrations per device per hour
   // Use Redis or in-memory cache
   ```

6. **Response format**
   ```typescript
   return NextResponse.json({
     success: true,
     jwt: "...",
     high_scan: true,
     company_id: "...",
     handset_id: "..."
   });
   ```

**Priority:** 🔴 **CRITICAL**  
**Estimated Time:** 2-3 hours

---

### **Task 2: Remove/Hide Token Generation UI**

**File:** `app/dashboard/admin/handsets/page.tsx`

**Current State:**
- Token generation button exists
- Token display exists
- User mentioned they removed it (verify)

**Required Changes:**
1. **Remove or hide token generation section**
   - Comment out or remove `generateToken()` function
   - Remove "Generate Token" button
   - Remove token display section
   - Add note: "Handsets now activate directly via mobile app"

2. **Update UI messaging**
   ```tsx
   <Card>
     <CardHeader>
       <CardTitle>SSCC Scanner Activation</CardTitle>
     </CardHeader>
     <CardContent>
       <p className="text-sm text-muted-foreground">
         Handsets activate directly from the mobile app using company ID.
         No token generation required.
       </p>
     </CardContent>
   </Card>
   ```

**Priority:** 🟡 **MEDIUM**  
**Estimated Time:** 30 minutes

---

### **Task 3: Update Handset Management Display**

**File:** `app/dashboard/admin/handsets/page.tsx`  
**API:** `app/api/admin/handsets/route.ts`

**Required Changes:**
1. **Show registration method**
   - Display "Registered via: Mobile App" or "Registered via: Token" (for legacy)
   - Show registration timestamp
   - Show last scan time (if available)

2. **Display handset details**
   ```typescript
   type Handset = {
     id: string;
     device_fingerprint: string;
     company_id: string;
     status: "ACTIVE" | "INACTIVE";
     high_scan_enabled: boolean;
     activated_at: string;
     registration_method: "register-lite" | "token"; // NEW
     last_scan_at?: string; // NEW
   };
   ```

3. **Add handset actions**
   - Deactivate handset
   - View handset details
   - View scan history (if available)

**Priority:** 🟡 **MEDIUM**  
**Estimated Time:** 2-3 hours

---

### **Task 4: Add Company Settings for SSCC Scanning**

**File:** `app/dashboard/admin/scanner-settings` (if exists)  
**API:** `app/api/admin/scanner-settings/route.ts`

**Required Settings:**
1. **Enable/Disable SSCC Scanning**
   - Master switch to enable/disable SSCC scanning for company
   - Controls access to `/api/scanner/submit` endpoint

2. **Handset Registration Control**
   - Enable/disable new handset registrations
   - Controls `/api/handset/register-lite` endpoint

3. **Display Settings**
   ```tsx
   <Card>
     <CardHeader>
       <CardTitle>SSCC Scanning Settings</CardTitle>
     </CardHeader>
     <CardContent>
       <div className="space-y-4">
         <div className="flex items-center justify-between">
           <div>
             <Label>Enable SSCC Scanning</Label>
             <p className="text-sm text-muted-foreground">
               Allow handsets to scan SSCC codes (boxes, cartons, pallets)
             </p>
           </div>
           <Switch checked={ssccEnabled} onCheckedChange={setSSCCEnabled} />
         </div>
         
         <div className="flex items-center justify-between">
           <div>
             <Label>Allow New Handset Registration</Label>
             <p className="text-sm text-muted-foreground">
               Allow mobile apps to register new handsets
             </p>
           </div>
           <Switch checked={registrationEnabled} onCheckedChange={setRegistrationEnabled} />
         </div>
       </div>
     </CardContent>
   </Card>
   ```

**Priority:** 🟡 **MEDIUM**  
**Estimated Time:** 1-2 hours

---

### **Task 5: Update Handset API to Include Registration Method**

**File:** `app/api/admin/handsets/route.ts`

**Required Changes:**
1. **Add registration method detection**
   ```typescript
   // Check if handset was registered via register-lite (has device_fingerprint)
   // vs token activation (has token_id in handset_tokens)
   const registrationMethod = handset.device_fingerprint 
     ? "register-lite" 
     : "token"; // legacy
   ```

2. **Include in response**
   ```typescript
   const handsets = handsetsList.map(h => ({
     id: h.id,
     device_fingerprint: h.device_fingerprint,
     status: h.status,
     high_scan_enabled: h.high_scan_enabled,
     activated_at: h.activated_at,
     registration_method: "register-lite", // NEW
     last_scan_at: null // TODO: Add from scan_logs
   }));
   ```

**Priority:** 🟢 **LOW**  
**Estimated Time:** 1 hour

---

### **Task 6: Add Handset Deactivation Feature**

**File:** `app/api/admin/handsets/route.ts` (add DELETE/PATCH endpoint)  
**UI:** `app/dashboard/admin/handsets/page.tsx`

**Required Changes:**
1. **Create deactivation API**
   ```typescript
   // PATCH /api/admin/handsets/:id
   export async function PATCH(req: Request, { params }: { params: { id: string } }) {
     // Update handset status to INACTIVE
     await prisma.handsets.update({
       where: { id: params.id },
       data: { status: "INACTIVE" }
     });
   }
   ```

2. **Add UI button**
   ```tsx
   <Button 
     variant="destructive" 
     onClick={() => deactivateHandset(handset.id)}
   >
     Deactivate
   </Button>
   ```

**Priority:** 🟢 **LOW**  
**Estimated Time:** 1-2 hours

---

### **Task 7: Add Handset Statistics Dashboard**

**File:** `app/dashboard/admin/handsets/page.tsx`

**Required Features:**
1. **Statistics Display**
   - Total active handsets
   - Handsets registered today/week/month
   - Total SSCC scans (if available)
   - Most active handsets

2. **Charts/Graphs** (optional)
   - Handset registration over time
   - Scan activity by handset
   - SSCC scan volume

**Priority:** 🟢 **LOW** (Nice to have)  
**Estimated Time:** 3-4 hours

---

### **Task 8: Update Scanner Settings API**

**File:** `app/api/admin/scanner-settings/route.ts`

**Required Changes:**
1. **Add SSCC-specific settings**
   ```typescript
   type ScannerSettings = {
     activation_enabled: boolean;      // Master switch for activation
     scanning_enabled: boolean;        // Master switch for scanning
     sscc_scanning_enabled: boolean;   // NEW: SSCC scanning toggle
     registration_enabled: boolean;    // NEW: New registration toggle
   };
   ```

2. **Update database schema** (if needed)
   - Add `sscc_scanning_enabled` to `company_active_heads.heads`
   - Add `registration_enabled` to `company_active_heads.heads`

**Priority:** 🟡 **MEDIUM**  
**Estimated Time:** 1 hour

---

### **Task 9: Add Company Validation Helper**

**File:** `lib/utils/companyValidation.ts` (new file)

**Purpose:** Reusable company validation logic

**Content:**
```typescript
export async function validateCompany(companyId: string) {
  const company = await prisma.companies.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, status: true }
  });
  
  if (!company) {
    throw new Error("Company not found");
  }
  
  // Check if company is active (not frozen/deleted)
  if (company.status !== "ACTIVE") {
    throw new Error("Company is not active");
  }
  
  return company;
}
```

**Priority:** 🟢 **LOW**  
**Estimated Time:** 30 minutes

---

### **Task 10: Add Rate Limiting Middleware**

**File:** `lib/middleware/rateLimit.ts` (new file)

**Purpose:** Prevent abuse of registration endpoint

**Content:**
```typescript
import { LRUCache } from 'lru-cache';

const rateLimitCache = new LRUCache<string, number>({
  max: 1000,
  ttl: 60 * 60 * 1000 // 1 hour
});

export function rateLimit(identifier: string, maxRequests: number = 10): boolean {
  const count = rateLimitCache.get(identifier) || 0;
  if (count >= maxRequests) {
    return false; // Rate limit exceeded
  }
  rateLimitCache.set(identifier, count + 1);
  return true;
}
```

**Usage in register-lite:**
```typescript
if (!rateLimit(device_fingerprint, 10)) {
  return NextResponse.json(
    { success: false, error: "Rate limit exceeded. Max 10 registrations per hour." },
    { status: 429 }
  );
}
```

**Priority:** 🟡 **MEDIUM**  
**Estimated Time:** 1 hour

---

## 📊 Implementation Priority Summary

### 🔴 **CRITICAL** (Must Have)
1. **Task 1:** Update `/api/handset/register-lite` endpoint
   - Company validation
   - Duplicate check
   - Correct defaults (high_scan_enabled: true)
   - JWT response format

### 🟡 **MEDIUM** (Should Have)
2. **Task 2:** Remove/hide token generation UI
3. **Task 3:** Update handset management display
4. **Task 4:** Add company settings for SSCC scanning
5. **Task 8:** Update scanner settings API
6. **Task 10:** Add rate limiting

### 🟢 **LOW** (Nice to Have)
7. **Task 5:** Update handset API (registration method)
8. **Task 6:** Add handset deactivation
9. **Task 7:** Add statistics dashboard
10. **Task 9:** Add company validation helper

---

## 📝 Implementation Checklist

### Backend API Changes
- [ ] Task 1: Update `/api/handset/register-lite`
- [ ] Task 5: Update `/api/admin/handsets` (registration method)
- [ ] Task 6: Add handset deactivation API
- [ ] Task 8: Update scanner settings API
- [ ] Task 9: Add company validation helper
- [ ] Task 10: Add rate limiting middleware

### Frontend UI Changes
- [ ] Task 2: Remove/hide token generation UI
- [ ] Task 3: Update handset management display
- [ ] Task 4: Add company settings UI
- [ ] Task 6: Add deactivation button
- [ ] Task 7: Add statistics dashboard

### Testing
- [ ] Test company validation
- [ ] Test duplicate device check
- [ ] Test rate limiting
- [ ] Test JWT generation
- [ ] Test handset display
- [ ] Test settings toggle

---

## 🎯 Quick Start Implementation Order

1. **Start with Task 1** (Critical backend fix)
2. **Then Task 2** (Remove token UI - user mentioned done, verify)
3. **Then Task 3** (Update display)
4. **Then Task 4 & 8** (Settings)
5. **Then remaining tasks** (Nice to have)

---

## 📌 Notes

- **Token Generation:** User mentioned they removed UI for token generation. Verify this is complete.
- **Backward Compatibility:** Keep token-based activation working for existing handsets.
- **Database:** No schema changes needed (handsets table already has required fields).
- **JWT Secret:** Ensure `JWT_SECRET` environment variable is set.

---

**Last Updated:** 2026-01-23  
**Status:** Ready for Implementation
