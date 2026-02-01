# Billing, Discount, and Invoice Flow — Read-Only Review

**Scope:** Trace and document only. No code changes, no fixes proposed.

---

## REVIEW 1 — Invoice Authority

### 1. Where invoices are created today

| System | Creates invoice? | When / how |
|--------|------------------|------------|
| **Razorpay** | Yes (Razorpay’s own entity) | Razorpay creates a subscription invoice when a subscription cycle is charged. It exists only inside Razorpay. |
| **RxTrace (billing_invoices)** | Yes | Rows are created **only** in the **Razorpay webhook** when events like `invoice.paid` are received. The webhook reads `invoiceEntity.amount_paid` (or `amount`), converts paise → INR, and inserts/updates `billing_invoices`. So the **record** that represents “this invoice” in the product is created in RxTrace, from Razorpay payload. |
| **Zoho Books** | Yes | A Zoho Books invoice is created by `trySyncBillingInvoiceToZoho()` **after** a row is inserted into `billing_invoices`. Sync is triggered from the same webhook path (after `ensureSubscriptionInvoice` / `ensureAddonInvoice`). So Zoho invoice is created **from** `billing_invoices` (and mappings), not directly from Razorpay. |

So: **Razorpay** creates the payment and the “invoice” in its system; **RxTrace** creates the **billing_invoices** row from the webhook; **Zoho** creates a Books invoice from the billing_invoices row (and item mappings).

### 2. Which invoice is used where

| Use | Source |
|-----|--------|
| **Shown to users** | **billing_invoices** (RxTrace). Dashboard Billing → Invoices list and details come from `GET /api/billing/invoices`, which reads only `billing_invoices`. |
| **Download PDF** | If the row has `metadata.zoho.invoice_id`, the download route fetches the **Zoho Books PDF**. Otherwise it uses **RxTrace** `renderInvoicePdfBuffer()` from **billing_invoices** data. So either Zoho or RxTrace PDF, depending on sync. |
| **GST filing** | Not defined in code. In practice, if the business uses Zoho Books for compliance, they would use **Zoho Books** data/exports for GST. The code does not state that billing_invoices is the legal source for filing. |
| **Accounting / audit** | **Zoho Books** is the natural place if the org uses it for books. **billing_invoices** is the internal record of “what we show and what we synced”; it is not necessarily the single audit source. |

### 3. Does Zoho recalculate or mirror?

- **Zoho does not mirror payment/invoice amount.**  
  `zohoInvoiceSync.ts` builds **line_items** from:
  - **Subscription:** one line with `item_id` and `rate` from **zoho_item_mapping** (item_type `subscription`), `quantity: 1`.
  - **Add-on:** lines from `metadata` addon items; `rate` again from **zoho_item_mapping** by item type; quantity from metadata.

- Zoho’s API receives `line_items` with `rate` and `quantity`. Zoho Books then **recalculates** the invoice total as the sum of (rate × quantity) for those lines. **billing_invoices.amount** is **not** sent as the Zoho total.

- So: **Zoho recomputes** the total from mapped rates and quantities. It does **not** “mirror” the paid amount from Razorpay or the amount stored in billing_invoices. The Zoho total will match only if the mapping’s `unit_price` (and quantities) happen to equal the actual charged amount (including discount/tax).

---

## REVIEW 2 — Discount Flow Reality

### 1. Subscription with coupon

| Step | Where | What happens |
|------|--------|--------------|
| Validation | `app/api/billing/subscription/upgrade/route.ts` | Coupon code from body; lookup in `discounts`; check validity (valid_from, valid_to, usage_limit, usage_count); check `company_discounts` so the coupon is assigned to this company. |
| Calculation | Same file | `calculateFinalAmount()` (company discount) and then coupon discount from `discounts` (type + value). Subtotal after coupon; tax on that. Negative addons built for “Discount” and “Coupon”; GST as positive addon. |
| Sent to Razorpay | Same file | `razorpay.subscriptions.create({ plan_id, total_count, …, addons })`. Addons array includes **negative** amounts for discount and coupon. Razorpay subscription API documents addons as “upfront amount you want to **collect**” (positive). **Negative addons are not documented** and are likely ignored or unsupported. |
| Where discount affects money | — | **Only in RxTrace** (preview, notes). **Razorpay** is not observed to apply these negative addons; the charged amount is typically plan + positive addons (e.g. GST) only. So **discount does not actually affect the amount charged** today. |

### 2. Subscription with company discount (no coupon)

| Step | Where | What happens |
|------|--------|--------------|
| Validation | N/A | Company has `discount_type`, `discount_value`, `discount_applies_to` (from companies). No coupon code. |
| Calculation | `upgrade/route.ts` | `calculateFinalAmount()` with company discount; then negative addon for “Discount (X%)” or “Discount (₹X)”. |
| Sent to Razorpay | Same file | Same `addons`; negative discount line. Same limitation: Razorpay likely does not apply it. |
| Where discount affects money | — | Same as coupon: **only in RxTrace**. Not in Razorpay charge. |

### 3. Subscription with no discount

| Step | Where | What happens |
|------|--------|--------------|
| Calculation | `upgrade/route.ts` | Base plan price; no discount; tax if company has GST. Addons = only GST (positive) if applicable. |
| Sent to Razorpay | Same file | `plan_id` + addons (GST only if any). Razorpay charges plan + addons. |
| Where discount affects money | — | N/A. Amount charged = plan + GST. |

### 4. Explicit answers

- **Is Razorpay the final authority for discount?**  
  **No.** Razorpay is not applying any discount today. We send negative addons; Razorpay does not use them as discount. The **amount actually charged** is decided by Razorpay from **plan + addons they accept** (effectively plan + GST). So Razorpay is the authority for **what was charged**, but that amount does **not** include any discount.

- **Is any system recomputing amounts after payment?**  
  **Yes.** In the webhook, when creating/updating `billing_invoices`, we store **amount = amountInr** from Razorpay (the paid amount). We then **recompute** base_amount, discount_amount, tax_amount, etc., from:
  - `params.metadata.discount` (discountBreakdown), which for subscription invoices is **built inside the webhook** from company discount (flat or percentage), **not** from Razorpay payload.
  - Company GST to derive tax.
  So the **stored total** is Razorpay’s; the **breakdown** (base, discount, tax) is **recomputed** by RxTrace in the webhook and may not match what Razorpay actually did (e.g. if Razorpay never applied discount).

---

## REVIEW 3 — Code Responsibility Boundaries

### 1. Who currently decides what

| Decision | System | Where in code |
|----------|--------|----------------|
| **Final amount charged** | **Razorpay** | Razorpay charges based on subscription plan + addons they apply. We send plan_id + addons; we do not set “total” directly. So Razorpay is the authority for the charged amount. |
| **Tax amount** | **RxTrace** | `lib/billing/tax.ts` and usage in upgrade + webhook. We compute 18% GST when company has GST number; we send it as a **positive addon** to Razorpay. Razorpay charges it. So we “decide” tax; Razorpay “executes” it. |
| **Invoice total (billing_invoices.amount)** | **Razorpay** (value) + **RxTrace** (record) | Webhook sets `amount` from Razorpay’s `invoiceEntity.amount_paid` (or amount). So the number is Razorpay’s; the row is written by RxTrace. |
| **Discount/coupon application at charge time** | **Neither** | RxTrace calculates and sends negative addons; Razorpay does not apply them. So no single system is actually applying discount to the payment. |

### 2. Duplicate or overlapping logic

| Area | RxTrace | Razorpay | Zoho Books |
|------|---------|----------|------------|
| **Subscription amount** | Upgrade: base, company discount, coupon, tax. Calculate-amount: same for preview. | Plan amount; addons (we send discount as negative, GST as positive). Only positive addons effectively applied. | Not in subscription flow. |
| **Invoice total** | Webhook: stores Razorpay amount; recomputes breakdown (base, discount, tax) from company + metadata.discount. | Source of amount_paid we store. | Builds invoice from line_items (rate × qty from mapping); does not use our stored amount. |
| **Tax** | Computed in tax.ts; sent as addon; webhook recomputes tax from company GST and amount. | Charges the addon we send. | Not recalculating tax in the reviewed sync; Zoho gets line items with rate. If Zoho applies tax by their rules, that’s separate. |
| **Discount** | Calculated in upgrade and calculate-amount; sent as addon; webhook builds discountBreakdown from company. | Does not apply negative addons. | Sync does not pass discount; Zoho gets mapping-based line items only. |

So: **RxTrace** and **Razorpay** both have “logic” for what the customer should pay; they are **not** aligned (discount sent but not applied). **Zoho** has its own total from mappings and does not mirror Razorpay or billing_invoices amount.

---

## OUTPUT — Summary and Contradictions

### Invoice authority (single system)

- **There is no single invoice authority** today:
  - **Razorpay** is the authority for **amount actually charged** (and for the existence of a subscription invoice in their system).
  - **billing_invoices** is the authority for **what the app shows** (list, details, and PDF when not using Zoho).
  - **Zoho Books** is the authority for **accounting/GST** if the business uses it, but Zoho’s total is **recalculated** from item mappings, not copied from Razorpay or billing_invoices.

So: “Invoice” means different things in each system; no one system is the single source of truth for “the” invoice end-to-end.

### Discount authority (single system)

- **There is no effective discount authority** at charge time:
  - **RxTrace** decides and calculates discount (and coupon) and sends it to Razorpay as negative addons.
  - **Razorpay** does not apply those addons (subscription addons are for positive “amount to collect”). So the **effective** authority for “what was actually discounted” at payment is **nobody** — the customer is charged full plan + GST, while we believe we applied a discount.

So: Discount is “authoritative” only in RxTrace’s **display** and **stored breakdown**, not in the payment or in Razorpay.

### What Zoho Books’ role should be

- **Current role:** Secondary copy for accounting. We create a Zoho invoice **from** billing_invoices (and mappings) after each paid invoice is stored. Zoho total = mapping-based (rate × quantity), so it **should** be used for books only if those mappings are kept in sync with actual prices/discounts. It is **not** a mirror of “what Razorpay charged” or “what billing_invoices.amount is.”
- **Reasonable role:** Either (1) **Mirror of truth:** Zoho should receive the **actual** amount and breakdown (e.g. from billing_invoices or Razorpay) so Zoho invoice total = amount paid, suitable for GST and audit; or (2) **Accounting only:** Keep Zoho as a separate books system with mapping-driven lines, and accept that its total may differ from Razorpay/billing_invoices unless mappings are carefully maintained.

### Contradictions in current flow

1. **Discount not applied but stored:** We store discount_amount and a breakdown in billing_invoices (from webhook recompute), but Razorpay did not apply any discount. So the **amount** in billing_invoices matches Razorpay (correct), but the **breakdown** (base, discount, tax) can imply a discount that never happened on the card. Risk: user sees “Discount: -₹X” on an invoice whose total is actually “full price + tax.”
2. **Two totals for the same invoice:** billing_invoices.amount = what Razorpay charged. Zoho invoice total = sum(mapping rate × qty). They can differ. So we have two “totals” for the same business event.
3. **Tax:** We compute tax and send as addon; Razorpay charges it. So tax is consistent. But in the webhook we **recompute** tax from company GST and amount; if Razorpay ever changed how they round or apply addons, our stored tax_amount could diverge from reality.
4. **Preview vs reality:** Pricing page “You pay” preview uses calculate-amount (discount + coupon + tax). Actual charge is plan + GST only. So preview can be **lower** than what is actually charged.

---

## Opinion (Reviewer)

- The main issue is **discount/coupon not affecting the real charge**. We should treat Razorpay as the only authority for “what was charged.” To have discount actually apply, we need to use Razorpay’s **offer_id** (or equivalent) so that Razorpay applies the discount and the amount_paid we get in the webhook is already discounted. Until then, we should not show or store a “discount” breakdown that implies the customer paid less than they did.
- **Invoice authority** should be clarified: e.g. “Razorpay = payment truth; billing_invoices = app and PDF truth; Zoho = accounting truth only if we feed it the same numbers.” Right now Zoho is fed different numbers (mapping-based), so it is not a mirror.
- **Single source of truth:** For “what the customer owes and paid,” the only reliable source today is **Razorpay** (amount_paid). For “what we show in the dashboard and on PDFs,” the source is **billing_invoices**, which we populate from Razorpay plus our own recomputed breakdown. Aligning discount and breakdown with Razorpay (via offers or similar) would make the flow consistent and avoid contradictions.

---

*End of read-only review. No code changes or fixes proposed.*
