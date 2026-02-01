# RXTrace Production-Ready Review – Clarity Confirmation

## What I understand (no assumptions)

### Scope (in scope – I will audit and fix)

1. **Company resolution** – Canonical resolver: owner (`companies.user_id`) + member/seat (if applicable). Used everywhere: pricing, dashboard, billing, invoices, middleware. Invariant: companyId must not be null when a company exists for that user.
2. **Subscription flow** – Pricing click → payment → webhook → activation. Server-verified only; no silent redirects; no UI-decided entitlement.
3. **Trial flow** – Decoupled from subscription and from company resolution. Trial does not block paid subscription; trial is not proof of company existence.
4. **Discounts & pricing** – Coupons + company-level; eligibility, expiry, reuse; precedence; server-side only; single source of truth.
5. **GST / tax** – Optional (when `companies.gst` present). Order: base → company discount → coupon → subtotal → GST 18% → final. Same in preview, subscription creation, invoice.
6. **Invoice** – Created only after confirmed payment. Links: company, subscription, payment. Stores base, discounts, tax, final. Totals must match payment.
7. **Dashboard cost calculation** – Plan price from admin/plans; addon price from admin/addons; usage from factual data; calculation server-side; no hardcoded/stale values; admin price change must reflect immediately.
8. **Admin / addon pricing** – Trace admin update → persistence → billing usage → dashboard display. No pricing in UI constants; backend recalculates every request.
9. **UI calculations** – Display-only; backend recalculates; any mismatch = blocker.
10. **RXTrace production gate** – Answer YES/NO to all 10 criteria; any NO = not production ready.

### Out of scope (I will not touch unless you say so)

- Auth/signup/signin flows (except where they resolve company).
- Regulator, public pages, compliance content.
- ERP, Zoho, external integrations.
- Code generation (unit/SSCC) logic.
- Anything not listed in the 10 areas above.

### What I need from you (one critical question)

**Company resolution – member/seat mapping**

- The prompt says: “Owner (companies.user_id)” and “Member/seat mapping (if applicable)”.
- **Question:** Do you have a **seat** or **member** table that links a user to a company (so a user can belong to a company without being `companies.user_id`)?
  - If **yes:** Please confirm table name(s) and column(s) (e.g. `seats(user_id, company_id)` or similar). I will implement the canonical resolver as: resolve by `companies.user_id` first; if null, resolve by seat/member table. I will not assume column names.
  - If **no:** I will implement the canonical resolver as **owner only** (`companies.user_id`). No seat fallback.

Once you answer, I will not assume anything else for company resolution.

### How I will output

- **Audit:** For each area: issue, exact failure condition, required fix, how to verify (RXTrace-style: observable, reproducible).
- **Fixes:** Only in-scope changes. If a fix touches something outside the 10 areas, I will ask first.
- **Gate:** YES/NO for each of the 10 criteria; no “confirmed fixed” without verification steps.

---

**Confirm:** If the above matches your intent, reply with **“Yes”** and your answer to the seat/member question (yes + table/columns, or no). Then I will proceed to audit and fix.
