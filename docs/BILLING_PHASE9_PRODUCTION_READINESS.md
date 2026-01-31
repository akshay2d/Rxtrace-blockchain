# Phase 9: Billing Production Readiness

**Objective:** Ensure billing (subscriptions, add-ons, invoices, Razorpay) is ready for production before and after go-live.

**Dependencies:** Phases 0–8 (billing fix and E2E testing) complete.

---

## 1. Pre-launch checklist

### Environment

- [ ] **Razorpay keys** (production):
  - `RAZORPAY_KEY_ID` or `NEXT_PUBLIC_RAZORPAY_KEY_ID`
  - `RAZORPAY_KEY_SECRET`
- [ ] **Subscription plan IDs** (must match Razorpay dashboard):
  - `RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_MONTHLY`
  - `RAZORPAY_SUBSCRIPTION_PLAN_ID_STARTER_ANNUAL`
  - `RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_MONTHLY`
  - `RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_ANNUAL`
  - `RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_MONTHLY`
  - `RAZORPAY_SUBSCRIPTION_PLAN_ID_ENTERPRISE_QUARTERLY`
- [ ] **Supabase** (and env) configured; migrations applied.

### Database

- [ ] Migrations applied (including billing):
  - `billing_invoices`: columns `tax_rate`, `tax_amount`, `has_gst`, `gst_number`, `discount_type`, `discount_value`, `discount_amount`, `billing_cycle`
  - `addon_carts`: columns `coupon_id`, `discount_paise`
  - `subscription_plans`: active plans with correct `base_price` and `billing_cycle`
- [ ] `companies`: columns `gst`, `discount_type`, `discount_value`, `discount_applies_to` present and used.

### Razorpay dashboard

- [ ] Plans created with correct amounts and billing intervals (monthly/annual/quarterly).
- [ ] Webhook URL configured: `https://<your-domain>/api/razorpay/webhook` (or `/api/webhooks/razorpay` per your app).
- [ ] Webhook events: subscription events and payment events needed for invoices and subscription status.

### Application

- [ ] Pricing page: “You pay” and breakdown match Razorpay and invoice (Phase 7).
- [ ] Free trial: no payment; trial activation does not call Razorpay (Phase 1).
- [ ] Subscription upgrade: correct plan ID for selected billing cycle; discount and tax applied via addons (Phases 3–4).
- [ ] Add-on cart: coupon applied; order amount and activation flow correct (Phase 6 + coupon).
- [ ] Invoice PDF: tax and discount breakdown shown when present (Phase 6).

### Health check

- [ ] `GET /api/billing/health` (admin) returns `billing_ready: true` when keys and plan env vars are set (see Phase 9 health API).

---

## 2. Post-launch verification

- [ ] Create a test company with GST and discount; run through Phase 8 E2E checklist (subscription with GST+discount, without GST, monthly vs annual).
- [ ] Add-on purchase with coupon; confirm invoice and usage count.
- [ ] Download invoice PDF; confirm amount, tax, and discount lines.
- [ ] Razorpay webhook receives events; subscription and invoice status stay in sync.

---

## 3. Runbook (incidents)

### Subscription created but invoice not created

- Check Razorpay webhook logs; confirm payload and signature.
- Confirm `ensureSubscriptionInvoice` (or equivalent) in webhook handler runs and that `billing_invoices` insert succeeds.
- Check Supabase logs and RLS for `billing_invoices`.

### Wrong amount on Razorpay / invoice

- Confirm company `gst`, `discount_type`, `discount_value`, `discount_applies_to`.
- Confirm `subscription_plans.base_price` for the plan and billing cycle.
- Re-run calculation logic (e.g. `POST /api/billing/calculate-amount`) and compare with Razorpay subscription addons and invoice rows.

### Plan ID not found / wrong plan

- Confirm env var for that plan+cycle (e.g. `RAZORPAY_SUBSCRIPTION_PLAN_ID_GROWTH_ANNUAL`).
- Confirm frontend sends correct `billing_cycle` to upgrade API.
- Check `razorpaySubscriptionPlanIdFor(plan, cycle)` and Razorpay dashboard plan IDs.

### Coupon not applied

- Confirm coupon is in `discounts`, active, within date range, and assigned to company in `company_discounts`.
- Confirm usage limit not exceeded (`usage_count` vs `usage_limit`).
- Check create-order / upgrade request includes `coupon_code` and backend validation.

---

## 4. Phase 9 deliverables

| Item | Description |
|------|-------------|
| Production checklist | This doc (pre-launch, post-launch, runbook). |
| Billing health API | `GET /api/billing/health` (admin): keys and plan env vars set, optional DB check. |
| E2E reference | Phase 8 tests + `docs/PHASE8_E2E_TESTING.md` for manual verification. |

---

## 5. Success criteria

- [ ] All pre-launch checklist items verified.
- [ ] Billing health endpoint returns healthy when config is correct.
- [ ] Runbook steps documented and known to on-call.
- [ ] At least one full E2E pass (Phase 8) after deployment.
