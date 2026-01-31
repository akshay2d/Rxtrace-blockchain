# Branch Roles — Production Deployment (Mandatory)

**Date:** January 2026  
**Purpose:** Clarify backup vs deployment branches before any production push.

---

## STEP 1 — Branch roles (CONFIRMED)

### 1. BACKUP branch

**Branches other than `main` with billing/deployment-related changes:**

| Branch | Contains | Role |
|--------|----------|------|
| **billing-fix-comprehensive** | Full subscription billing implementation (tax, discount, billing cycle, invoices, calculate-amount, health, validate-coupon, migrations, lib/billing/tax.ts, docs). Currently same **commit** as main; the newer logic exists as **uncommitted** changes on this branch. | **Designated BACKUP branch** once secured (see below). |
| **backup-before-billing-fix-phase0** | Snapshot from before billing fix phases. | Pre–billing-fix recovery only; not the “newer” backup. |
| **backup/ui-changes** | UI-related backup. | Not billing-specific. |

**Designated BACKUP branch:** **`billing-fix-comprehensive`**

- **Must:** Contain the complete billing logic (after we commit current work to it).
- **Must:** Be preserved exactly as-is; no rebase, squash, or delete.
- **Must NOT:** Be deployed directly. Deployment is from `main` only.
- **Use:** Recovery and reference only (e.g. hotfix from main using this branch as reference).

### 2. DEPLOYMENT branch

**Only branch allowed for production deployment:** **`main`**

- Vercel (or any production deploy) must use **`main`** only.
- If deployment is attempted from any other branch → **STOP**.

---

## Summary

- **BACKUP:** `billing-fix-comprehensive` (after securing: commit all current work to it).
- **DEPLOYMENT:** `main` only.
- **Rule:** Never deploy from the backup branch; never push with a dirty working tree.
