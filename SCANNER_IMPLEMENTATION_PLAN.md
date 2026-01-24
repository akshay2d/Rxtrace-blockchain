# Scanner Implementation Plan
**Dual-Mode Scanning Architecture**
**Date:** 2026-01-23
**Status:** Planning Phase

---

## 📋 Executive Summary

### Goal
Implement dual-mode scanning system:
- **Public Unit Label Scanning**: Free, no authentication, consumer verification
- **Private SSCC Logistics Scanning**: Authenticated, company-linked, billing applies

### Key Changes
1. Modify `/api/handset/register-lite` for company-based registration
2. Update mobile app to support dual-mode scanning
3. Ensure `/api/scan` remains public for unit labels
4. Ensure `/api/scanner/submit` requires authentication for SSCC

---

## 🎯 Phase 1: Backend Changes

### Task 1.1: Update `/api/handset/register-lite` Endpoint

**Current Issues:**
- Sets `high_scan_enabled: false` (should be `true`)
- Sets `role: "UNIT_ONLY"` (should be full access)
- Returns `token` instead of `jwt`
- No duplicate device fingerprint check per company
- No company validation

**Required Changes:**
1. **Validate company_id exists and is active**
   - Check company exists in database
   - Check company is not frozen/deleted
   - Return error if invalid

2. **Check for duplicate device fingerprint per company**
   - Allow same device for different companies
   - Prevent duplicate device for same company
   - Return existing handset JWT if already registered

3. **Set correct defaults**
   - `high_scan_enabled: true` (full SSCC access)
   - `role: "FULL_ACCESS"` (not UNIT_ONLY)
   - `status: "ACTIVE"`

4. **Update JWT payload**
   - Include `role: "FULL_ACCESS"` (or omit, default to full)
   - Include `high_scan: true`
   - Use `jwt` field name (not `token`)

5. **Add rate limiting**
   - Max 10 registrations per device per hour
   - Prevent abuse/spam

6. **Response format**
   ```json
   {
     "success": true,
     "jwt": "...",
     "high_scan": true,
     "company_id": "...",
     "handset_id": "..."
   }
   ```

**Files to Modify:**
- `app/api/handset/register-lite/route.ts`

**Testing Checklist:**
- [ ] Valid company_id → Success, returns JWT
- [ ] Invalid company_id → Error 400
- [ ] Duplicate device for same company → Returns existing JWT
- [ ] Same device for different company → Success (new handset)
- [ ] Rate limit exceeded → Error 429
- [ ] Missing parameters → Error 400

---

### Task 1.2: Verify `/api/scan` Endpoint (No Changes Needed)

**Current Behavior:**
- ✅ No authentication required
- ✅ Auto-resolves company_id from serial/SSCC
- ✅ Works for unit labels
- ✅ Works for SSCC (but should use `/api/scanner/submit` for mobile)
- ✅ Free for unit scans
- ✅ Billing for SSCC scans

**Verification:**
- [ ] Confirm no authentication required
- [ ] Confirm unit label scanning works
- [ ] Confirm company auto-resolution works
- [ ] Confirm billing only for SSCC (not unit)

**Action:** No changes needed, verify current behavior

---

### Task 1.3: Verify `/api/scanner/submit` Endpoint

**Current Behavior:**
- ✅ Requires JWT authentication
- ✅ Extracts company_id from JWT
- ✅ Role-based restrictions (UNIT_ONLY blocks SSCC)
- ✅ Billing for SSCC scans
- ✅ Handset validation

**Required Verification:**
- [ ] JWT contains `company_id`, `handset_id`, `role`
- [ ] Role check: `UNIT_ONLY` blocks SSCC scanning
- [ ] Billing applies correctly (box: ₹0.2, carton: ₹1, pallet: ₹4)
- [ ] Unit scans are free (scanType: 'unit')
- [ ] Handset must be ACTIVE

**Action:** Verify current behavior, ensure role defaults to full access

**Files to Review:**
- `app/api/scanner/submit/route.ts`

---

### Task 1.4: Update JWT Role Logic (if needed)

**Current Issue:**
- `register-lite` sets `role: "UNIT_ONLY"` (wrong)
- Should default to full access

**Required Changes:**
- Default role should be full access (or no role restriction)
- Only restrict if explicitly set to `UNIT_ONLY`
- Update JWT to include `high_scan: true` by default

**Files to Modify:**
- `app/api/handset/register-lite/route.ts`
- `app/api/scanner/submit/route.ts` (verify role check logic)

---

## 📱 Phase 2: Mobile App Changes

### Task 2.1: Add Device Fingerprint Generation

**Required:**
- Install `expo-application` package
- Generate unique device ID
- Store persistently (for re-activation)

**Implementation Steps:**
1. Add dependency: `expo-application` or `expo-device`
2. Create utility function to get device ID
3. Use consistent ID across app restarts
4. Handle permissions if needed

**Files to Create/Modify:**
- `RxTraceScanner/utils/deviceId.ts` (new)
- `RxTraceScanner/package.json` (add dependency)

**Testing:**
- [ ] Device ID generated on first launch
- [ ] Same ID on app restart
- [ ] Different IDs on different devices
- [ ] ID persists after app reinstall (if possible)

---

### Task 2.2: Implement Company Selection/Input Screen

**Required:**
- First-time activation screen
- Company ID input/selection
- Validation and error handling

**UI Flow:**
```
App Launch
  ↓
Check if JWT exists
  ↓
If JWT exists → Ready to scan
  ↓
If no JWT → Show activation screen
  ↓
User enters/selects company_id
  ↓
Call /api/handset/register-lite
  ↓
Store JWT → Ready to scan
```

**Implementation Steps:**
1. Create activation screen component
2. Add company ID input field
3. Add validation (UUID format)
4. Add error handling
5. Show loading state during registration
6. Store JWT on success

**Files to Create/Modify:**
- `RxTraceScanner/components/ActivationScreen.tsx` (new)
- `RxTraceScanner/App.tsx` (integrate activation flow)

**Features:**
- [ ] Company ID input field
- [ ] Format validation (UUID)
- [ ] Error messages
- [ ] Success confirmation
- [ ] Skip option (for unit-only scanning)

---

### Task 2.3: Update Token Management to JWT Management

**Current:**
- Stores activation token (RX-XXXXXX)
- Uses token as Bearer token (wrong)

**Required:**
- Store JWT token from registration
- Use JWT for authenticated API calls
- Remove activation token UI

**Implementation Steps:**
1. Replace `TOKEN_STORAGE_KEY` with `JWT_STORAGE_KEY`
2. Update `loadToken()` to load JWT
3. Update `handleActivateToken()` to call register-lite
4. Remove token input modal
5. Add activation screen instead
6. Update API calls to use JWT

**Files to Modify:**
- `RxTraceScanner/App.tsx`
  - Remove token modal
  - Add activation screen
  - Update storage keys
  - Update API call headers

**Testing:**
- [ ] JWT stored after registration
- [ ] JWT loaded on app restart
- [ ] JWT used in API calls
- [ ] JWT expiration handled (re-activate)

---

### Task 2.4: Implement Dual-Mode Scanning

**Mode 1: Public Unit Label Scanning**
- No authentication required
- Use `/api/scan` endpoint
- Free for all users

**Mode 2: Private SSCC Scanning**
- JWT authentication required
- Use `/api/scanner/submit` endpoint
- Billing applies

**Implementation Steps:**
1. Detect scan type from parsed GS1 data
   - If `parsed.sscc` exists → SSCC scan
   - If `parsed.serial` exists → Unit scan

2. Route to correct endpoint
   - Unit scan → `/api/scan` (no auth)
   - SSCC scan → `/api/scanner/submit` (with JWT)

3. Handle scan type detection
   - Determine level: box/carton/pallet
   - Send correct `scanType` parameter

4. Update UI to show mode
   - Show "Public Verification" for unit scans
   - Show "Logistics Mode" for SSCC scans

**Files to Modify:**
- `RxTraceScanner/App.tsx`
  - Update `handleScan()` function
  - Add scan type detection
  - Route to correct endpoint
  - Update UI labels

**Scan Type Detection Logic:**
```typescript
function detectScanType(parsed: ParsedGs1): 'unit' | 'box' | 'carton' | 'pallet' {
  if (parsed.sscc) {
    // SSCC code - need to determine level
    // For now, default to 'box' (can be enhanced later)
    return 'box'; // or detect from API response
  }
  if (parsed.serial) {
    return 'unit';
  }
  return 'unit'; // default
}
```

**Testing:**
- [ ] Unit label scan → Uses `/api/scan` (no auth)
- [ ] SSCC scan → Uses `/api/scanner/submit` (with JWT)
- [ ] Correct scanType sent
- [ ] Billing applies for SSCC only
- [ ] Error handling for unauthenticated SSCC scan

---

### Task 2.5: Update API Endpoint Configuration

**Current:**
- Hardcoded: `VERIFY_ENDPOINT = 'https://rxtrace.in/api/verify'`

**Required:**
- Add base URL configuration
- Support multiple endpoints:
  - `/api/scan` (public unit scanning)
  - `/api/scanner/submit` (authenticated SSCC scanning)
  - `/api/handset/register-lite` (activation)

**Implementation Steps:**
1. Add base URL constant
2. Create endpoint URLs
3. Support environment switching (dev/staging/prod)
4. Update all API calls

**Files to Modify:**
- `RxTraceScanner/App.tsx`
  - Add `API_BASE_URL` constant
  - Create endpoint URLs
  - Update fetch calls

**Configuration:**
```typescript
const API_BASE_URL = 'https://rxtrace.in'; // or from env
const ENDPOINTS = {
  SCAN_PUBLIC: `${API_BASE_URL}/api/scan`,
  SCAN_AUTH: `${API_BASE_URL}/api/scanner/submit`,
  REGISTER: `${API_BASE_URL}/api/handset/register-lite`
};
```

---

### Task 2.6: Add Activation Status Display

**Required:**
- Show activation status in UI
- Display company name (if available)
- Allow re-activation if needed

**Implementation Steps:**
1. Add activation status indicator
2. Show company name from JWT (if decoded)
3. Add "Re-activate" option
4. Show handset ID (for support)

**Files to Modify:**
- `RxTraceScanner/App.tsx`
  - Add status display component
  - Decode JWT to show company info
  - Add re-activation button

**UI Elements:**
- [ ] Activation badge (Active/Inactive)
- [ ] Company name display
- [ ] Re-activate button
- [ ] Handset ID (for support)

---

## 🧪 Phase 3: Testing Strategy

### Test 3.1: Backend API Testing

**Test Cases:**

1. **`/api/handset/register-lite`**
   - [ ] Valid company_id → Success, returns JWT
   - [ ] Invalid company_id → Error 400
   - [ ] Missing parameters → Error 400
   - [ ] Duplicate device for same company → Returns existing JWT
   - [ ] Same device for different company → Success (new handset)
   - [ ] Rate limit (10/hour) → Error 429 after limit
   - [ ] JWT contains correct fields (company_id, handset_id, role, high_scan)

2. **`/api/scan` (Public)**
   - [ ] Unit label scan without auth → Success
   - [ ] SSCC scan without auth → Success (but should use submit endpoint)
   - [ ] Auto-resolve company_id from serial → Works
   - [ ] Auto-resolve company_id from SSCC → Works
   - [ ] Billing for SSCC → Applied
   - [ ] No billing for unit → Free

3. **`/api/scanner/submit` (Authenticated)**
   - [ ] Valid JWT → Success
   - [ ] Invalid JWT → Error 401
   - [ ] Missing JWT → Error 401
   - [ ] Unit scan with JWT → Success, free
   - [ ] SSCC scan with JWT → Success, billing applied
   - [ ] UNIT_ONLY role → Blocks SSCC, allows unit
   - [ ] FULL_ACCESS role → Allows all scan types
   - [ ] Inactive handset → Error 403

---

### Test 3.2: Mobile App Testing

**Test Cases:**

1. **Device Fingerprint**
   - [ ] Generated on first launch
   - [ ] Persists across app restarts
   - [ ] Unique per device
   - [ ] Format is valid

2. **Activation Flow**
   - [ ] First launch shows activation screen
   - [ ] Company ID input works
   - [ ] Validation works (UUID format)
   - [ ] Registration API call succeeds
   - [ ] JWT stored correctly
   - [ ] Success message shown
   - [ ] App ready to scan after activation

3. **Unit Label Scanning**
   - [ ] No activation required
   - [ ] Uses `/api/scan` endpoint
   - [ ] No authentication header
   - [ ] Results displayed correctly
   - [ ] Free (no billing)

4. **SSCC Code Scanning**
   - [ ] Requires activation (JWT)
   - [ ] Uses `/api/scanner/submit` endpoint
   - [ ] JWT sent in Authorization header
   - [ ] Correct scanType sent
   - [ ] Results displayed correctly
   - [ ] Billing applied
   - [ ] Error if not activated

5. **Scan Type Detection**
   - [ ] Unit label → Detected as 'unit'
   - [ ] SSCC code → Detected as 'box'/'carton'/'pallet'
   - [ ] Correct endpoint used
   - [ ] Correct parameters sent

6. **Error Handling**
   - [ ] Invalid company_id → Error shown
   - [ ] Network error → Error shown
   - [ ] JWT expired → Re-activation prompt
   - [ ] SSCC scan without activation → Error shown

---

### Test 3.3: Integration Testing

**Test Scenarios:**

1. **End-to-End: Unit Label Scan (Public)**
   - [ ] User opens app (no activation)
   - [ ] Scans unit label
   - [ ] App calls `/api/scan` (no auth)
   - [ ] Results displayed
   - [ ] No billing applied

2. **End-to-End: SSCC Scan (Authenticated)**
   - [ ] User opens app
   - [ ] Activates with company_id
   - [ ] Receives JWT
   - [ ] Scans SSCC code
   - [ ] App calls `/api/scanner/submit` (with JWT)
   - [ ] Results displayed
   - [ ] Billing applied

3. **End-to-End: Mixed Scanning**
   - [ ] User activates for company A
   - [ ] Scans unit label → Works (public)
   - [ ] Scans SSCC from company A → Works (authenticated)
   - [ ] Scans SSCC from company B → Error (wrong company)

---

## 🚀 Phase 4: Deployment Plan

### Step 4.1: Backend Deployment

**Pre-Deployment:**
1. Review all code changes
2. Run backend tests
3. Verify database migrations (if any)
4. Check environment variables

**Deployment Steps:**
1. Deploy updated `/api/handset/register-lite` endpoint
2. Verify endpoint is accessible
3. Test registration flow
4. Monitor for errors

**Rollback Plan:**
- Keep old endpoint version
- Can revert if issues found
- Database changes are backward compatible

---

### Step 4.2: Mobile App Deployment

**Pre-Deployment:**
1. Build app for testing
2. Test on physical devices
3. Test activation flow
4. Test scanning flows

**Deployment Steps:**
1. Update app version
2. Build production APK/AAB
3. Test on staging environment
4. Deploy to Play Store (if applicable)
5. Monitor crash reports

**Rollback Plan:**
- Keep previous app version
- Can push hotfix if needed
- Users can reinstall previous version

---

### Step 4.3: Gradual Rollout

**Phase A: Internal Testing (Week 1)**
- Deploy to staging
- Test with internal team
- Fix any issues
- Verify all flows work

**Phase B: Beta Testing (Week 2)**
- Release to beta testers
- Collect feedback
- Monitor errors
- Make improvements

**Phase C: Full Release (Week 3)**
- Release to all users
- Monitor production metrics
- Support users
- Fix critical issues

---

## 📊 Phase 5: Monitoring & Support

### Metrics to Track

1. **Activation Metrics**
   - Number of activations per day
   - Activation success rate
   - Activation failure reasons
   - Average time to activate

2. **Scanning Metrics**
   - Unit scans per day (public)
   - SSCC scans per day (authenticated)
   - Scan success rate
   - Error rate by type

3. **Performance Metrics**
   - API response times
   - App crash rate
   - Battery usage
   - Network errors

4. **Business Metrics**
   - Billing transactions (SSCC scans)
   - Revenue from SSCC scanning
   - Active handsets per company
   - User retention

---

### Support Plan

1. **Documentation**
   - User guide for activation
   - Troubleshooting guide
   - FAQ for common issues

2. **Error Handling**
   - Clear error messages
   - Support contact information
   - Error logging for debugging

3. **Support Channels**
   - In-app help
   - Email support
   - Support ticket system

---

## ✅ Success Criteria

### Must Have (Critical)
- [ ] Unit label scanning works without activation
- [ ] SSCC scanning requires activation
- [ ] Company-based registration works
- [ ] JWT authentication works
- [ ] Billing applies correctly
- [ ] No critical bugs

### Should Have (Important)
- [ ] Activation flow is user-friendly
- [ ] Error messages are clear
- [ ] App performance is good
- [ ] No crashes
- [ ] Good user experience

### Nice to Have (Optional)
- [ ] Auto-detect company from first scan
- [ ] Company selection from list
- [ ] Activation status display
- [ ] Re-activation flow
- [ ] Analytics dashboard

---

## 📝 Implementation Checklist

### Backend
- [ ] Task 1.1: Update `/api/handset/register-lite`
- [ ] Task 1.2: Verify `/api/scan` (no changes)
- [ ] Task 1.3: Verify `/api/scanner/submit`
- [ ] Task 1.4: Update JWT role logic

### Mobile App
- [ ] Task 2.1: Add device fingerprint generation
- [ ] Task 2.2: Implement activation screen
- [ ] Task 2.3: Update token to JWT management
- [ ] Task 2.4: Implement dual-mode scanning
- [ ] Task 2.5: Update API endpoint configuration
- [ ] Task 2.6: Add activation status display

### Testing
- [ ] Test 3.1: Backend API testing
- [ ] Test 3.2: Mobile app testing
- [ ] Test 3.3: Integration testing

### Deployment
- [ ] Step 4.1: Backend deployment
- [ ] Step 4.2: Mobile app deployment
- [ ] Step 4.3: Gradual rollout

### Monitoring
- [ ] Set up metrics tracking
- [ ] Set up error logging
- [ ] Create support documentation

---

## 🔄 Rollback Plan

### If Backend Issues
1. Revert `/api/handset/register-lite` to previous version
2. Keep `/api/scan` and `/api/scanner/submit` unchanged
3. Monitor error logs
4. Fix issues and redeploy

### If Mobile App Issues
1. Push previous app version
2. Notify users to update
3. Fix issues in next version
4. Release hotfix

---

## 📅 Timeline Estimate

### Week 1: Backend Development
- Day 1-2: Update register-lite endpoint
- Day 3: Testing and fixes
- Day 4-5: Code review and deployment

### Week 2: Mobile App Development
- Day 1-2: Device fingerprint and activation screen
- Day 3-4: Dual-mode scanning implementation
- Day 5: Testing and fixes

### Week 3: Testing & Deployment
- Day 1-2: Integration testing
- Day 3: Beta testing
- Day 4-5: Production deployment

**Total Estimated Time: 3 weeks**

---

## 🎯 Next Steps

1. **Review this plan** with team
2. **Approve changes** to architecture
3. **Start Phase 1** (Backend changes)
4. **Test thoroughly** before moving to Phase 2
5. **Deploy gradually** with monitoring

---

## 📌 Notes

- All changes are backward compatible
- Existing functionality remains intact
- No breaking changes to public APIs
- Database schema unchanged
- Can rollback at any time

---

**Plan Status:** ✅ Ready for Implementation
**Last Updated:** 2026-01-23
