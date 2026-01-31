# Phase 8: End-to-End Testing Checklist

Use this checklist to verify the billing flow after Phases 1–7. Automated tests cover **calculation logic** (`npm run test __tests__/billing`); **Razorpay, invoices, and PDF** require manual or environment-based verification.

---

## Prerequisites

- [ ] Razorpay env vars set: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and plan IDs (e.g. `RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY`, `RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_ANNUAL`).
- [ ] Supabase (and migrations) applied: `billing_invoices` has `tax_rate`, `tax_amount`, `discount_amount`, `billing_cycle`, etc.
- [ ] Test company (or admin) can set: `companies.gst`, `companies.discount_type`, `companies.discount_value`, `companies.discount_applies_to`.

---

## Run automated calculation tests

```bash
npm run test __tests__/billing
```

- [ ] All tests pass (Phase 2 tax + Phase 8 plan cases).

---

## Test 1: Subscription with GST and Discount

**Setup**

- Company GST: `22ABCDE1234F1Z5`
- Company discount: 10% on subscriptions
- Select: **Growth Annual** (₹500,000 base)

**Expected (calculation)**

- Base: ₹500,000  
- Discount (10%): -₹50,000  
- Subtotal: ₹450,000  
- Tax (18%): +₹81,000  
- **Final: ₹531,000**

**Manual verification**

- [ ] Pricing page “You pay” shows **₹531,000 / year** (and breakdown when logged in).
- [ ] Subscribe → Razorpay payment page shows **₹531,000**.
- [ ] Payment succeeds.
- [ ] Dashboard → Billing → Invoices: latest invoice has amount **531,000**, `tax_amount` and `discount_amount` populated.
- [ ] Invoice PDF shows breakdown (Base / Discount / GST / Total).

---

## Test 2: Subscription without GST

**Setup**

- Company: **no GST** (clear `gst` or leave blank).
- Company discount: 10% on subscriptions.
- Select: **Growth Annual** (₹500,000 base).

**Expected**

- Base: ₹500,000  
- Discount (10%): -₹50,000  
- **Final: ₹450,000** (no tax)

**Manual verification**

- [ ] Pricing page “You pay” shows **₹450,000 / year** (no GST line).
- [ ] Razorpay shows **₹450,000**.
- [ ] Invoice has `has_gst = false` (or equivalent), `tax_amount = 0`.

---

## Test 3: Monthly plan selection

**Setup**

- Select: **Growth Monthly** (₹49,000 base).

**Expected**

- Razorpay uses **monthly** plan ID (e.g. `RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY`).
- Amount = ₹49,000 (+ discount/tax if company has discount/GST).

**Manual verification**

- [ ] After payment, invoice or subscription record has `billing_cycle = 'monthly'`.
- [ ] Next charge is monthly (if applicable).

---

## Test 4: Annual plan selection

**Setup**

- Select: **Growth Annual** (₹500,000 base).

**Expected**

- Razorpay uses **annual** plan ID (e.g. `RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_ANNUAL`).
- Amount = ₹500,000 (+ discount/tax if applicable).

**Manual verification**

- [ ] Invoice has `billing_cycle = 'yearly'` (or 'annual' per DB schema).
- [ ] Amount is annual, not 12× monthly.

---

## Test 5: No discount (GST only)

**Setup**

- Company: **no discount** (clear discount_type / discount_value or set applies_to such that subscription has no discount).
- Company has GST.
- Select: **Growth Annual** (₹500,000 base).

**Expected**

- Base: ₹500,000  
- Tax (18%): +₹90,000  
- **Final: ₹590,000**

**Manual verification**

- [ ] Pricing page shows **₹590,000 / year**.
- [ ] Razorpay shows **₹590,000**.
- [ ] Invoice has `discount_amount = 0`, tax applied.

---

## Add-on cart + coupon

**Setup**

- Add add-ons to cart (e.g. unit labels, seats).
- Apply a valid coupon (assigned to company in admin).

**Manual verification**

- [ ] Cart “You pay” updates to reflect coupon discount.
- [ ] Checkout opens Razorpay with **discounted** order amount.
- [ ] After payment, add-on activates and coupon usage is incremented (if tracked).

---

## Success criteria (summary)

- [ ] **Tax:** Applied when GST present; 18%; on (base − discount).
- [ ] **Discount:** From company; reflected in Razorpay amount and invoice.
- [ ] **Billing cycle:** Monthly selection → monthly plan_id; annual → annual plan_id; stored in DB/invoice.
- [ ] **Invoice:** All required fields; GST number when applicable; PDF shows breakdown.
- [ ] **Pricing page:** “You pay” and breakdown match Razorpay and invoice.

---

## Optional: API-level checks (no UI)

- `POST /api/billing/calculate-amount` with `{ plan, billing_cycle }` (and optional `coupon_code`) returns `finalAmount` matching the above formulas.
- `POST /api/billing/calculate-cart-amount` with cart items and optional `coupon_code` returns `orderAmountInr` consistent with add-on checkout.

Run automated tests: `npm run test __tests__/billing`
