# PROJECT STRUCTURE & CHANGE AUDIT (PRE-SQL REVIEW)
**RxTrace – Multi-tenant Pharmaceutical Traceability Platform**

**Date:** 2025-01-20  
**Objective:** Inspect project structure and recent changes before SQL migration design

---

## 1. PROJECT STRUCTURE SUMMARY

### 1.1 Architecture Overview
- **Framework:** Next.js 14+ (App Router)
- **Database:** Supabase (PostgreSQL) with Row Level Security (RLS)
- **ORM:** Prisma (schema defined, but primary access via Supabase client)
- **Auth:** Supabase Auth (email/password + OTP verification)
- **Deployment:** Vercel (inferred from config files)

### 1.2 Directory Structure
```
app/
├── api/              # 94 API route handlers (Next.js API routes)
│   ├── auth/         # Authentication endpoints (send-otp, verify-otp, create-user-profile)
│   ├── setup/        # Company onboarding (create-company-profile, create-company)
│   ├── unit/         # Unit label generation
│   ├── scan/         # GS1 code scanning and validation
│   ├── billing/      # Billing, subscriptions, invoices
│   ├── admin/        # Admin operations (seats, handsets, company management)
│   ├── generate/     # Label generation jobs
│   ├── skus/         # SKU master management
│   └── [others]      # Reports, audit, integrations, etc.
├── auth/             # Frontend auth pages (signup, signin, verify)
├── dashboard/        # Protected dashboard pages
├── onboarding/       # Company setup UI
└── middleware.ts     # Route protection and session validation

lib/
├── gs1Canonical.ts   # ⭐ NEW: Canonical GS1 generation (single source of truth)
├── parseGS1.ts       # GS1 parsing logic
├── gs1.ts            # Legacy GS1 generation (deprecated wrapper)
├── gs1Builder.js     # Legacy GS1 builder (uses canonical internally)
├── auth/             # OTP generation, email sending
├── billing/           # Usage tracking, quota enforcement
├── supabase/         # Supabase client utilities (admin, server, client)
└── [others]          # Audit, email, error monitoring, etc.

supabase/migrations/  # 19 SQL migration files
prisma/schema.prisma   # Prisma schema (partial, not fully used)
```

---

## 2. DETECTED RECENT CHANGES (FILE-LEVEL)

### 2.1 GS1 Code Generation Refactor (HIGH IMPACT)
**Status:** ✅ Completed  
**Files Modified:**
- `lib/gs1Canonical.ts` - **NEW FILE** - Canonical GS1 generation function
- `lib/gs1.ts` - Modified to use `generateCanonicalGS1`
- `lib/gs1Builder.js` - Modified to use `generateCanonicalGS1`
- `app/api/unit/create/route.ts` - Updated to use canonical function + uniqueness check
- `app/api/scan/route.ts` - Added payload validation (compare scanned vs stored)
- `utils/gs1SerialUtil.ts` - Deprecated wrapper around canonical function
- `app/api/generate/commit/route.ts` - Updated to use canonical function

**Key Changes:**
- Single canonical function for GS1 payload generation (machine format, FNC1 separators)
- Mandatory AI validation (GTIN, Expiry, Mfg Date, Batch, Serial)
- GTIN check digit validation
- Variable-length AI max length enforcement
- Payload integrity validation on scan

**Database Impact:**
- `labels_units` table requires `gs1_payload` column (TEXT)
- Uniqueness constraint needed: `(company_id, gtin, batch, serial)`
- Index on `(company_id, serial)` for fast lookups

### 2.2 Authentication & Company Setup Flow (HIGH IMPACT)
**Status:** ✅ Completed  
**Files Modified:**
- `app/api/auth/send-otp/route.ts` - OTP generation and email sending
- `app/api/auth/verify-otp/route.ts` - OTP verification
- `app/api/auth/create-user-profile/route.ts` - User profile creation
- `app/api/setup/create-company-profile/route.ts` - Company onboarding
- `lib/auth/otp.ts` - Centralized OTP utilities
- `app/middleware.ts` - Route protection and company validation

**Key Changes:**
- Email-based OTP verification for signup
- Company profile creation with validation
- Auto-creation of owner seat on company creation
- Middleware checks for company existence and subscription status

**Database Impact:**
- `user_profiles` table required (id, email, full_name, created_at)
- `companies` table requires: `user_id`, `company_name`, `contact_person_name`, `firm_type`, `business_category`, `business_type`, `pan`, `gst`, `phone`, `address`, `email`, `subscription_status`, `subscription_plan`, `trial_start_date`, `trial_end_date`
- `otp_verifications` table required (id, email, otp, expires_at, verified, created_at)
- `seats` table required (auto-created owner seat)
- Unique constraint: `companies.user_id` (one company per user)

### 2.3 Billing & Usage Tracking (MEDIUM IMPACT)
**Status:** ✅ Completed  
**Files Modified:**
- `lib/billing/usage.ts` - Quota enforcement and usage tracking
- `app/api/billing/charge/route.ts` - Billing charge application
- `app/api/billing/subscription/route.ts` - Subscription management

**Database Impact:**
- `billing_usage` table required (tracks quotas and usage per period)
- `company_wallets` table required (balance, credit_limit, status)
- `billing_transactions` table required (transaction history)
- `company_active_heads` table required (paid module entitlements)
- `razorpay_orders` table required (payment orders)

### 2.4 Row Level Security (RLS) Implementation (HIGH IMPACT)
**Status:** ⚠️ Partially Complete  
**Files:**
- `supabase/migrations/20260115_enable_rls_production.sql` - RLS policies

**Database Impact:**
- RLS must be enabled on all tenant-scoped tables
- Policies must use `auth.uid()` for user identification
- **CRITICAL:** Type mismatch issue - `user_id` columns (TEXT) vs `auth.uid()` (UUID) requires casting

---

## 3. CODE → DATABASE DEPENDENCY MAP

### 3.1 Core Tables (Required for Basic Operations)

#### `companies` (Master Tenant Table)
**Code References:**
- `app/api/setup/create-company-profile/route.ts` (insert)
- `app/middleware.ts` (select by user_id)
- `app/api/skus/route.ts` (select by user_id)
- `lib/billing/usage.ts` (select by id)

**Expected Columns:**
```sql
id UUID PRIMARY KEY
user_id TEXT NOT NULL UNIQUE  -- ⚠️ TYPE MISMATCH: Code expects TEXT, some migrations use UUID
company_name TEXT NOT NULL
contact_person_name TEXT
firm_type TEXT CHECK (firm_type IN ('proprietorship', 'partnership', 'llp', 'pvt_ltd', 'ltd'))
business_category TEXT CHECK (business_category IN ('pharma', 'food', 'dairy', 'logistics'))
business_type TEXT CHECK (business_type IN ('manufacturer', 'exporter', 'distributor', 'wholesaler'))
subscription_status TEXT
subscription_plan TEXT
trial_start_date TIMESTAMPTZ
trial_end_date TIMESTAMPTZ
pan TEXT
gst TEXT
phone TEXT
address TEXT
email TEXT
extra_user_seats INTEGER DEFAULT 0
extra_erp_integrations INTEGER DEFAULT 0
razorpay_customer_id TEXT
razorpay_subscription_id TEXT
razorpay_subscription_status TEXT
razorpay_plan_id TEXT
subscription_cancel_at_period_end BOOLEAN DEFAULT false
subscription_current_period_end TIMESTAMPTZ
subscription_cancelled_at TIMESTAMPTZ
subscription_updated_at TIMESTAMPTZ
created_at TIMESTAMPTZ DEFAULT NOW()
```

**Required Indexes:**
- `idx_companies_user_id` ON `companies(user_id)`
- `idx_companies_subscription_status` ON `companies(subscription_status)`
- `idx_companies_trial_end_date` ON `companies(trial_end_date)`
- `idx_companies_email` ON `companies(email)`
- `idx_companies_pan` ON `companies(pan)` WHERE `pan IS NOT NULL`

**Required Constraints:**
- `UNIQUE(user_id)` - One company per user
- `UNIQUE(LOWER(TRIM(company_name)))` - Prevent duplicate company names

#### `seats` (Team/User Management)
**Code References:**
- `app/api/setup/create-company-profile/route.ts` (auto-create owner seat)
- `app/api/admin/seats/route.ts` (CRUD operations)
- `app/middleware.ts` (RLS policies reference seats)

**Expected Columns:**
```sql
id UUID PRIMARY KEY
company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE
user_id TEXT  -- ⚠️ TYPE MISMATCH: Code expects TEXT, migration 20260114 uses UUID
email TEXT
role TEXT DEFAULT 'operator' CHECK (role IN ('admin', 'operator', 'viewer'))
active BOOLEAN DEFAULT FALSE
status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive', 'revoked'))
invited_at TIMESTAMPTZ
activated_at TIMESTAMPTZ
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

**Required Indexes:**
- `idx_seats_company_id` ON `seats(company_id)`
- `idx_seats_user_id` ON `seats(user_id)`
- `idx_seats_email` ON `seats(email)`
- `idx_seats_status` ON `seats(status)`
- `idx_seats_active` ON `seats(active)`
- `UNIQUE(company_id, email)` WHERE `status IN ('active', 'pending')`

#### `labels_units` (Unit Labels - GS1 Codes)
**Code References:**
- `app/api/unit/create/route.ts` (insert with uniqueness check)
- `app/api/scan/route.ts` (select by serial, validate payload)
- `app/api/search/route.ts` (search by serial/GTIN)

**Expected Columns:**
```sql
id UUID PRIMARY KEY
company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE
sku_id UUID REFERENCES skus(id)
gtin TEXT NOT NULL
batch TEXT NOT NULL
mfd TEXT NOT NULL  -- Manufacturing date (YYMMDD format)
expiry TEXT NOT NULL  -- Expiry date (YYMMDD format)
mrp DECIMAL(10,2)  -- Maximum Retail Price
serial TEXT NOT NULL
gs1_payload TEXT NOT NULL  -- ⭐ NEW: Canonical GS1 machine-format payload
box_id UUID REFERENCES boxes(id)
created_at TIMESTAMPTZ DEFAULT NOW()
```

**Required Constraints:**
- `UNIQUE(company_id, gtin, batch, serial)` - ⭐ CRITICAL: Prevents duplicate serials (GS1 compliance)

**Required Indexes:**
- `idx_labels_units_company_serial` ON `labels_units(company_id, serial)`
- `idx_labels_units_company_gtin_batch` ON `labels_units(company_id, gtin, batch)`
- `idx_labels_units_box_id` ON `labels_units(box_id)` WHERE `box_id IS NOT NULL`

#### `boxes`, `cartons`, `pallets` (Packaging Hierarchy)
**Code References:**
- `app/api/box/create/route.ts`
- `app/api/carton/create/route.ts`
- `app/api/pallet/create/route.ts`
- `app/api/scan/route.ts` (hierarchy resolution)

**Expected Columns (boxes):**
```sql
id UUID PRIMARY KEY
company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE
sku_id UUID REFERENCES skus(id)
sscc TEXT  -- Serial Shipping Container Code
sscc_with_ai TEXT  -- SSCC with AI prefix (00)
code TEXT  -- Alternative identifier
carton_id UUID REFERENCES cartons(id)
pallet_id UUID REFERENCES pallets(id)
meta JSONB DEFAULT '{}'
created_at TIMESTAMPTZ DEFAULT NOW()
```

**Expected Columns (cartons):**
```sql
id UUID PRIMARY KEY
company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE
pallet_id UUID REFERENCES pallets(id)
code TEXT
sscc TEXT
sscc_with_ai TEXT
sku_id UUID REFERENCES skus(id)
meta JSONB DEFAULT '{}'
created_at TIMESTAMPTZ DEFAULT NOW()
```

**Expected Columns (pallets):**
```sql
id UUID PRIMARY KEY
company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE
sku_id UUID REFERENCES skus(id)
sscc TEXT UNIQUE  -- Must be unique across all pallets
sscc_with_ai TEXT
meta JSONB DEFAULT '{}'
created_at TIMESTAMPTZ DEFAULT NOW()
```

**Required Indexes:**
- `idx_boxes_sscc` ON `boxes(sscc)` WHERE `sscc IS NOT NULL`
- `idx_cartons_sscc` ON `cartons(sscc)` WHERE `sscc IS NOT NULL`
- `idx_pallets_sscc` ON `pallets(sscc)` WHERE `sscc IS NOT NULL`

#### `skus` (SKU Master)
**Code References:**
- `app/api/skus/route.ts` (CRUD)
- `app/api/unit/create/route.ts` (upsert)

**Expected Columns:**
```sql
id UUID PRIMARY KEY
company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE
sku_code TEXT NOT NULL
sku_name TEXT NOT NULL
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ
deleted_at TIMESTAMPTZ  -- Soft delete
```

**Required Constraints:**
- `UNIQUE(company_id, sku_code)` - One SKU code per company

**Required Indexes:**
- `idx_skus_company_id` ON `skus(company_id)`
- `idx_skus_company_deleted` ON `skus(company_id, deleted_at)` WHERE `deleted_at IS NULL`

### 3.2 Supporting Tables

#### `user_profiles`
**Code References:**
- `app/api/auth/create-user-profile/route.ts` (insert)

**Expected Columns:**
```sql
id TEXT PRIMARY KEY  -- ⚠️ TYPE MISMATCH: Matches auth.users.id (UUID in Supabase, but code uses TEXT)
email TEXT NOT NULL
full_name TEXT
created_at TIMESTAMPTZ DEFAULT NOW()
```

#### `otp_verifications`
**Code References:**
- `lib/auth/otp.ts` (insert, select, update)

**Expected Columns:**
```sql
id UUID PRIMARY KEY
email TEXT NOT NULL
otp TEXT NOT NULL
expires_at TIMESTAMPTZ NOT NULL
verified BOOLEAN DEFAULT FALSE
created_at TIMESTAMPTZ DEFAULT NOW()
```

**Required Indexes:**
- `idx_otp_email` ON `otp_verifications(email)`
- `idx_otp_verified` ON `otp_verifications(verified)`
- `idx_otp_expires_at` ON `otp_verifications(expires_at)`

#### `billing_usage`
**Code References:**
- `lib/billing/usage.ts` (select, upsert)
- `app/api/unit/create/route.ts` (RPC: `billing_usage_consume`)

**Expected Columns:**
```sql
id UUID PRIMARY KEY
company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE
billing_period_start TIMESTAMPTZ NOT NULL
billing_period_end TIMESTAMPTZ NOT NULL
plan TEXT NOT NULL
unit_labels_quota INTEGER DEFAULT 0
box_labels_quota INTEGER DEFAULT 0
carton_labels_quota INTEGER DEFAULT 0
pallet_labels_quota INTEGER DEFAULT 0
user_seats_quota INTEGER DEFAULT 1
unit_labels_used INTEGER DEFAULT 0
box_labels_used INTEGER DEFAULT 0
carton_labels_used INTEGER DEFAULT 0
pallet_labels_used INTEGER DEFAULT 0
user_seats_used INTEGER DEFAULT 1
created_at TIMESTAMPTZ DEFAULT NOW()
updated_at TIMESTAMPTZ DEFAULT NOW()
```

**Required Constraints:**
- `UNIQUE(company_id, billing_period_start)` - One usage record per company per period

**Required Indexes:**
- `idx_billing_usage_company_id` ON `billing_usage(company_id)`
- `idx_billing_usage_period` ON `billing_usage(billing_period_start, billing_period_end)`

#### `scan_logs`
**Code References:**
- `app/api/scan/route.ts` (insert on every scan)

**Expected Columns:**
```sql
id UUID PRIMARY KEY
company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE
handset_id UUID REFERENCES handsets(id)
raw_scan TEXT NOT NULL  -- Raw scanned GS1 string
parsed JSONB  -- Parsed GS1 data
metadata JSONB DEFAULT '{}'  -- Additional metadata (level, status, etc.)
status TEXT  -- 'SUCCESS', 'FAILED', 'PAYLOAD_MISMATCH'
code_id UUID  -- Reference to unit/box/carton/pallet ID
scanned_at TIMESTAMPTZ DEFAULT NOW()
created_at TIMESTAMPTZ DEFAULT NOW()
```

**Required Indexes:**
- `idx_scan_logs_company_id` ON `scan_logs(company_id)`
- `idx_scan_logs_handset_id` ON `scan_logs(handset_id)`
- `idx_scan_logs_status` ON `scan_logs(status)`
- `idx_scan_logs_scanned_at` ON `scan_logs(scanned_at DESC)`
- `idx_scan_logs_code_id` ON `scan_logs(code_id)` WHERE `code_id IS NOT NULL`

#### `audit_logs`
**Code References:**
- `lib/audit.ts` (insert via `writeAuditLog`)

**Expected Columns:**
```sql
id UUID PRIMARY KEY
company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE
actor TEXT NOT NULL  -- User ID or system identifier
action TEXT NOT NULL  -- Action name (e.g., 'label_generated', 'scan_performed')
status TEXT NOT NULL CHECK (status IN ('success', 'failed'))
integration_system TEXT  -- Optional: e.g., 'zoho', 'razorpay'
metadata JSONB DEFAULT '{}'
created_at TIMESTAMPTZ DEFAULT NOW()
```

**Required Indexes:**
- `idx_audit_logs_company_id` ON `audit_logs(company_id)`
- `idx_audit_logs_actor` ON `audit_logs(actor)`
- `idx_audit_logs_action` ON `audit_logs(action)`
- `idx_audit_logs_created_at` ON `audit_logs(created_at DESC)`

#### `company_wallets`
**Code References:**
- `app/api/billing/charge/route.ts` (select, update)

**Expected Columns:**
```sql
company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE
balance DECIMAL(10,2) DEFAULT 0
credit_limit DECIMAL(10,2) DEFAULT 10000
status TEXT DEFAULT 'ACTIVE'
updated_at TIMESTAMPTZ DEFAULT NOW()
```

#### `company_active_heads`
**Code References:**
- `app/api/scan/route.ts` (check for `high_scan` module)
- `app/api/admin/scanner-settings/route.ts` (update)

**Expected Columns:**
```sql
company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE
heads JSONB DEFAULT '{}'  -- { high_scan: true, scanner_scanning_enabled: true, ... }
updated_at TIMESTAMPTZ DEFAULT NOW()
```

#### `billing_transactions`
**Code References:**
- `app/api/billing/charge/route.ts` (insert)

**Expected Columns:**
```sql
id UUID PRIMARY KEY
company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE
type TEXT NOT NULL  -- 'scan', 'label_generation', 'subscription', etc.
subtype TEXT  -- 'unit', 'box', 'carton', 'pallet'
count INTEGER DEFAULT 1
amount DECIMAL(10,2) NOT NULL
balance_after DECIMAL(10,2) NOT NULL
created_at TIMESTAMPTZ DEFAULT NOW()
```

**Required Indexes:**
- `idx_billing_transactions_company_id` ON `billing_transactions(company_id)`

#### `handsets`, `handset_tokens`
**Code References:**
- `app/api/scan/route.ts` (validate handset)
- `app/api/admin/handsets/route.ts` (CRUD)

**Expected Columns (handsets):**
```sql
id UUID PRIMARY KEY
company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE
seat_id TEXT DEFAULT ''
device_fingerprint TEXT UNIQUE NOT NULL
high_scan_enabled BOOLEAN DEFAULT FALSE
status TEXT DEFAULT 'ACTIVE'
activated_at TIMESTAMPTZ DEFAULT NOW()
```

**Expected Columns (handset_tokens):**
```sql
id UUID PRIMARY KEY
company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE
token TEXT UNIQUE NOT NULL
high_scan BOOLEAN DEFAULT FALSE
used BOOLEAN DEFAULT FALSE
created_at TIMESTAMPTZ DEFAULT NOW()
```

### 3.3 Additional Tables (Referenced but Lower Priority)
- `packing_rules` - Packing hierarchy rules
- `generation_jobs` - Label generation job tracking
- `razorpay_orders` - Payment orders
- `zoho_oauth_tokens`, `zoho_organization_config`, `zoho_item_mapping`, `zoho_contact_mapping` - Zoho integration
- `addon_carts` - Add-on purchase carts
- `sscc_counters` - SSCC sequence tracking

---

## 4. RISKS IF SQL IS DESIGNED WITHOUT FIXES

### 4.1 CRITICAL RISKS (Production Blockers)

#### ⚠️ **RISK #1: Type Mismatch - `user_id` Columns (UUID vs TEXT)**
**Severity:** 🔴 CRITICAL  
**Impact:** RLS policies will fail, authentication will break

**Problem:**
- Code expects `companies.user_id` and `seats.user_id` to be `TEXT`
- Some migrations define them as `UUID`
- `auth.uid()` returns `UUID` type in Supabase
- RLS policies comparing `user_id::text = auth.uid()::text` may fail if column is UUID

**Evidence:**
- `app/middleware.ts:69` - `eq('user_id', session.user.id)` - expects TEXT
- `app/api/setup/create-company-profile/route.ts:72` - `eq('user_id', user_id)` - expects TEXT
- `supabase/migrations/20260114_create_seats_table.sql:13` - `user_id UUID REFERENCES auth.users(id)`
- `PRODUCTION_DATABASE_MIGRATIONS_STEP_BY_STEP.sql` - Attempts to convert UUID to TEXT

**Required Fix:**
- Ensure all `user_id` columns are `TEXT` type
- Cast `auth.uid()` to TEXT in all RLS policies: `auth.uid()::text = user_id`
- Or convert columns to TEXT before creating policies

#### ⚠️ **RISK #2: Missing Uniqueness Constraint on `labels_units`**
**Severity:** 🔴 CRITICAL  
**Impact:** Duplicate serials can be created, violating GS1 compliance

**Problem:**
- Code in `app/api/unit/create/route.ts` checks for uniqueness but relies on application-level logic
- No database constraint prevents race conditions
- Migration `20260120_gs1_uniqueness_and_validation.sql` adds constraint, but may not be applied

**Required Fix:**
- Add `UNIQUE(company_id, gtin, batch, serial)` constraint on `labels_units`
- Ensure migration is applied before production

#### ⚠️ **RISK #3: Missing `gs1_payload` Column**
**Severity:** 🔴 CRITICAL  
**Impact:** Scan validation will fail, payload integrity checks will break

**Problem:**
- `app/api/scan/route.ts:304` expects `unit.gs1_payload` to exist
- `app/api/unit/create/route.ts:156` inserts `gs1_payload`
- Migration may not include this column

**Required Fix:**
- Ensure `labels_units.gs1_payload TEXT NOT NULL` column exists
- Backfill existing records if needed

#### ⚠️ **RISK #4: RLS Policies Not Applied or Incomplete**
**Severity:** 🔴 CRITICAL  
**Impact:** Data leakage, unauthorized access

**Problem:**
- `supabase/migrations/20260115_enable_rls_production.sql` defines policies
- Policies may not be applied to all tables
- Type mismatches in policies will cause failures

**Required Fix:**
- Verify RLS is enabled on all tenant-scoped tables
- Ensure all policies use correct type casts
- Test policies with actual user sessions

### 4.2 HIGH RISKS (Functional Issues)

#### ⚠️ **RISK #5: Missing Foreign Key Constraints**
**Severity:** 🟠 HIGH  
**Impact:** Orphaned records, referential integrity violations

**Problem:**
- Code assumes foreign keys exist (e.g., `labels_units.company_id REFERENCES companies(id)`)
- Some migrations may not include foreign keys
- Cascading deletes may not be configured

**Required Fix:**
- Add all foreign key constraints
- Configure `ON DELETE CASCADE` where appropriate (e.g., `labels_units.company_id`)

#### ⚠️ **RISK #6: Missing Indexes on Frequently Queried Columns**
**Severity:** 🟠 HIGH  
**Impact:** Slow queries, poor performance at scale

**Problem:**
- Code queries by `company_id`, `user_id`, `serial`, `sscc` frequently
- Missing indexes will cause full table scans

**Required Fix:**
- Add indexes on all foreign keys
- Add composite indexes for common query patterns (e.g., `(company_id, serial)`)

#### ⚠️ **RISK #7: Missing Required Columns on `companies` Table**
**Severity:** 🟠 HIGH  
**Impact:** Company setup will fail, billing will break

**Problem:**
- `app/api/setup/create-company-profile/route.ts` inserts many columns
- `lib/billing/usage.ts` expects `subscription_status`, `subscription_plan`, `trial_end_date`
- Missing columns will cause insert/select errors

**Required Fix:**
- Ensure all columns listed in Section 3.1 (`companies` table) exist
- Use `ADD COLUMN IF NOT EXISTS` in migrations

### 4.3 MEDIUM RISKS (Data Quality Issues)

#### ⚠️ **RISK #8: Missing Check Constraints**
**Severity:** 🟡 MEDIUM  
**Impact:** Invalid data can be inserted (e.g., invalid `firm_type`, `status` values)

**Problem:**
- Code validates enums in application layer, but database doesn't enforce
- Invalid values can be inserted via direct SQL or bugs

**Required Fix:**
- Add CHECK constraints for enum columns (`firm_type`, `business_category`, `status`, etc.)

#### ⚠️ **RISK #9: Missing Default Values**
**Severity:** 🟡 MEDIUM  
**Impact:** NULL values where non-null expected, application errors

**Problem:**
- Code may assume defaults (e.g., `seats.active DEFAULT FALSE`)
- Missing defaults can cause NULL reference errors

**Required Fix:**
- Ensure all columns have appropriate DEFAULT values
- Use `NOT NULL` where values are required

---

## 5. READINESS VERDICT

### ❌ **NOT SAFE TO DESIGN SQL WITHOUT FIXES**

### 5.1 Blocking Issues
1. **Type Mismatch (`user_id` UUID vs TEXT)** - Must be resolved before RLS policies work
2. **Missing Uniqueness Constraint (`labels_units`)** - Required for GS1 compliance
3. **Missing `gs1_payload` Column** - Required for scan validation
4. **RLS Policy Completeness** - Must verify all policies are applied and type-safe

### 5.2 Required Actions Before SQL Design

#### **STEP 1: Resolve Type Mismatch**
- **Action:** Convert all `user_id` columns to `TEXT` type
- **Files to Review:**
  - `supabase/migrations/20260114_create_seats_table.sql` (change `user_id UUID` to `user_id TEXT`)
  - `PRODUCTION_DATABASE_MIGRATIONS_STEP_BY_STEP.sql` (STEP 0 - ensure type conversion works)
- **Verification:** Run migration and verify columns are TEXT

#### **STEP 2: Verify Required Tables and Columns**
- **Action:** Audit all tables against Section 3.1-3.2
- **Method:** Run SQL queries to check column existence:
  ```sql
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_name = 'companies'
  ORDER BY ordinal_position;
  ```
- **Fix:** Add missing columns via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`

#### **STEP 3: Verify Constraints and Indexes**
- **Action:** Check for required constraints and indexes
- **Method:** Query `pg_constraint` and `pg_indexes`
- **Fix:** Add missing constraints/indexes

#### **STEP 4: Test RLS Policies**
- **Action:** Verify RLS policies work with actual user sessions
- **Method:** Test SELECT/INSERT/UPDATE with authenticated users
- **Fix:** Update policies if type casts are incorrect

### 5.3 Safe Components (No Changes Needed)
- ✅ GS1 canonical generation logic (`lib/gs1Canonical.ts`)
- ✅ Authentication flow (`app/api/auth/*`)
- ✅ Company setup flow (`app/api/setup/*`)
- ✅ Billing usage tracking logic (`lib/billing/usage.ts`)
- ✅ Scan validation logic (`app/api/scan/route.ts`)

---

## 6. RECOMMENDATIONS

### 6.1 Immediate Actions
1. **Fix Type Mismatch:** Update all migrations to use `TEXT` for `user_id` columns
2. **Apply Missing Constraints:** Add uniqueness constraint on `labels_units`
3. **Verify Column Existence:** Run audit queries to check all required columns exist
4. **Test RLS Policies:** Create test users and verify policies work

### 6.2 Before Production
1. **Run Full Migration Suite:** Apply all migrations in order
2. **Backfill Data:** If `gs1_payload` is missing, backfill from existing data
3. **Performance Testing:** Verify indexes are used in query plans
4. **Security Audit:** Verify RLS policies prevent unauthorized access

### 6.3 SQL Design Guidelines
1. **Use `IF NOT EXISTS`:** All `CREATE TABLE`, `ADD COLUMN`, `CREATE INDEX` should be idempotent
2. **Type Consistency:** Always use `TEXT` for `user_id` columns (match `auth.users.id` as TEXT)
3. **Explicit Casts:** Cast `auth.uid()` to TEXT in all RLS policies: `auth.uid()::text = user_id`
4. **Cascade Deletes:** Use `ON DELETE CASCADE` for child tables (e.g., `labels_units.company_id`)
5. **Index All Foreign Keys:** Add indexes on all foreign key columns

---

## 7. APPENDIX: MIGRATION FILE INVENTORY

### Applied Migrations (19 files)
1. `20251213155702_final_company_schema.sql`
2. `20251218000100_sku_master_constraints.sql`
3. `20251220_fix_skus_table.sql`
4. `20251222_disable_rls_handset_tokens.sql`
5. `20251229_add_parent_child_tracking.sql`
6. `20260101_create_audit_logs.sql`
7. `20260101_setup_flow_schema.sql` ⭐ (OTP, billing_usage, razorpay_orders)
8. `20260102_add_extra_user_seats.sql`
9. `20260104_billing_addons_and_quota_enforcement.sql`
10. `20260105_billing_invoice_amount_breakdown.sql`
11. `20260105_razorpay_subscriptions.sql`
12. `20260109000100_addon_carts.sql`
13. `20260111_zoho_books_integration.sql`
14. `20260112_fix_billing_invoice_uniqueness.sql`
15. `20260114_create_seats_table.sql` ⚠️ (user_id UUID - needs fix)
16. `20260115_enable_rls_production.sql` ⭐ (RLS policies)
17. `20260120_gs1_uniqueness_and_validation.sql` ⭐ (Uniqueness constraint)
18. `20260121_priority1_production_schema.sql` ⭐ (labels_units, boxes, cartons, pallets)
19. `20260122_priority2_pre_scale_requirements.sql` ⭐ (scan_logs, audit_logs, user_profiles, etc.)

### Pending/Consolidated Migrations
- `PRODUCTION_DATABASE_MIGRATIONS.sql` - Consolidated migration (may have errors)
- `PRODUCTION_DATABASE_MIGRATIONS_STEP_BY_STEP.sql` - Step-by-step version (being debugged)

---

**END OF AUDIT**
