# Phase 1: Database Schema Updates — Checkpoint

**Status:** ✅ Implementation complete — **verification pending (run migration + SQL)**

---

## 1. Table mapping (plan vs codebase)

- **Plan says:** `invoices` table  
- **Codebase uses:** `public.billing_invoices` for all subscription/addon invoice storage (webhook, APIs, PDF).  
- **Phase 1 applied to:** `billing_invoices` (same intent as plan).

---

## 2. What was done

### 2.1 Migration (columns + indexes)

- **File:** `supabase/migrations/20260131000200_billing_invoices_tax_discount_cycle.sql`
- **Columns added (ADD COLUMN IF NOT EXISTS):**
  - `tax_rate` NUMERIC(5,4)
  - `tax_amount` NUMERIC(18,2)
  - `has_gst` BOOLEAN DEFAULT false
  - `gst_number` TEXT
  - `discount_type` TEXT CHECK (percentage/flat)
  - `discount_value` NUMERIC(18,2)
  - `discount_amount` NUMERIC(18,2)
  - `billing_cycle` TEXT CHECK (monthly/yearly/quarterly)
- **Indexes added (Phase 1):**
  - `idx_billing_invoices_has_gst` ON billing_invoices(has_gst) WHERE has_gst = true
  - `idx_billing_invoices_billing_cycle` ON billing_invoices(billing_cycle)
- **Comments:** Set on all new columns per plan.

### 2.2 Verification script

- **File:** `scripts/verify-phase1-schema.sql`  
- Run after migration: checks columns, indexes, and row count on `billing_invoices`.

---

## 3. Phase 1 checklist (you run)

| Item | Status | How to verify |
|------|--------|----------------|
| Migration runs without errors | ⏳ Pending | Apply migration in Supabase (Dashboard → SQL or `supabase db push` / `psql $DATABASE_URL -f supabase/migrations/20260131000200_billing_invoices_tax_discount_cycle.sql`) |
| All columns created | ⏳ Pending | Run `scripts/verify-phase1-schema.sql` — section 1 must return 8 rows |
| Indexes created | ⏳ Pending | Same script — section 2 must return 2 indexes |
| Existing invoices unaffected | ⏳ Pending | All new columns nullable; run section 3 to confirm count |

---

## 4. Evidence (after you run)

1. **Migration:** Paste CLI or Dashboard “Migration applied” (or “no error”) output.  
2. **Verify schema:** Paste result of `scripts/verify-phase1-schema.sql` (all 3 sections).  
3. **Cart/addon:** No changes to `/api/addons/*`, cart pricing, coupon, or checkout.

---

## 5. Rollback (if Phase 1 fails)

```sql
-- Rollback Phase 1 (billing_invoices) — only if migration must be reverted
DROP INDEX IF EXISTS public.idx_billing_invoices_has_gst;
DROP INDEX IF EXISTS public.idx_billing_invoices_billing_cycle;
ALTER TABLE public.billing_invoices
  DROP COLUMN IF EXISTS tax_rate,
  DROP COLUMN IF EXISTS tax_amount,
  DROP COLUMN IF EXISTS has_gst,
  DROP COLUMN IF EXISTS gst_number,
  DROP COLUMN IF EXISTS discount_type,
  DROP COLUMN IF EXISTS discount_value,
  DROP COLUMN IF EXISTS discount_amount,
  DROP COLUMN IF EXISTS billing_cycle;
```

---

## 6. Blockers

- **None in code.**  
- **Unblock verification:** Apply migration and run `scripts/verify-phase1-schema.sql` (requires DB access).

---

## 7. Next

- After migration + verification: mark Phase 1 checklist **PASS** and proceed to **Phase 2: Tax Configuration**.
