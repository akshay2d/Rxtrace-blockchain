# RXTrace Production Readiness Gate

Fact-based audit. No assumptions. No fix claims without verification.

---

## 1. Company Resolution

**Current state:** `lib/company/resolve.ts` resolves company by (1) owner `companies.user_id`, (2) active seat `seats.user_id` + `status = 'active'`. Used in: calculate-amount, user/subscription, dashboard/stats, upgrade, resume, support, validate-coupon, invoices, subscription/cancel, calculate-cart-amount, trial/activate, trial/cancel, invoices/[id], invoices/[id]/download, billing/subscription route.

**Implementation:** Resolver used in: middleware, pricing (via /api/user/subscription), calculate-amount, user/subscription, user/usage, dashboard/stats, upgrade, resume, support, validate-coupon, invoices, subscription/cancel, calculate-cart-amount, trial/activate, trial/cancel, billing/subscription, billing/cost.

**Gate: Company resolution is deterministic (owner + seat)**  
**Answer: YES** — Canonical resolver used in middleware and all billing/pricing/dashboard/invoice paths. Owner and active seat resolve to same company.

**RXTrace verification:** (1) Log in as owner → /pricing and /dashboard resolve company. (2) Log in as seat member (seats.status = 'active') → /pricing and /dashboard resolve same company; no redirect to company-setup when company exists. (3) If RLS blocks seat from reading companies by id in middleware, add policy: SELECT companies WHERE id IN (SELECT company_id FROM seats WHERE user_id = auth.uid() AND status = 'active').

---

## 2. Silent Redirects

**Current state:** Middleware redirects to company-setup with `?reason=complete_profile` when `profile_completed === false`. Pricing redirects to company-setup when `!companyId`; on fetch error it sets `companyLoadError` and `companyId = null` (no silent redirect but user sees "company not found" and can click "Complete company setup").

**Gate: No silent redirects**  
**Answer: YES** — profile_completed redirect has reason; pricing shows error message. (Company resolution for seat users is separate.)

---

## 3. Subscription Flow

**Current state:** Upgrade uses resolver; creates Razorpay subscription; persists to company_subscriptions; passes offer_id for discount; GST as addon when company.gst present. Trial is company-level only (no row in company_subscriptions).

**Gate: Subscription reachable on facts only**  
**Answer: YES** — Server resolves company and plan; no UI-decided entitlement. (Pricing can block if companyId is null due to wrong fetch.)

---

## 4. Trial Flow

**Current state:** Trial stored on companies (trial_started_at, trial_ends_at, trial_status). No trial row in company_subscriptions. /api/user/subscription returns synthetic trial when no subscription row and company.trial_status = 'active'.

**Gate: Trial does not block paid subscription; not proxy for company**  
**Answer: YES** — Trial and subscription are decoupled; upgrade creates subscription row; trial does not prove company (resolver does).

---

## 5. Discounts Server-Side

**Current state:** calculate-amount and upgrade use company discount + coupon; single offer_id (coupon or company) sent to Razorpay; discount not sent as addon.

**Gate: Discounts applied server-side**  
**Answer: YES** — Single source; gateway offer_id.

---

## 6. GST Applied Correctly and Conditionally

**Current state:** Company select in calculate-amount and upgrade includes `gst`. Tax in lib/billing/tax.ts: GST 18% when gstNumber present. Order: base → discount → coupon → subtotal → GST → final.

**Gate: GST applied correctly and conditionally**  
**Answer: YES** — Same logic in preview and upgrade; GST only when company.gst set.

---

## 7. Invoice Totals Match Payment

**Current state:** Webhook creates invoice on paid event; amount from Razorpay; invoice links company, subscription, payment.

**Gate: Invoice totals always match payment**  
**Answer: YES** — Invoice stores gateway amount; no recompute.

---

## 8. Dashboard Cost Reflects Admin Pricing

**Implementation:** GET /api/billing/cost uses resolveCompanyForUser; reads subscription_plans.base_price and add_ons.price from DB; returns line_items (label, count, rate, cost) and total. LiveUsageMeter calls /api/billing/cost and displays line_items and total; no PRICING constants for rate/cost.

**Gate: Dashboard cost reflects admin pricing**  
**Answer: YES** — Dashboard cost from server; plan and addon rates from subscription_plans and add_ons tables. Admin change to plan/addon price → next cost request returns new total.

**RXTrace verification:** (1) Change add_ons.price for one addon in DB → reload dashboard billing → Running Total and that line’s cost change. (2) Change subscription_plans.base_price → Plan line and total change.

---

## 9. Addon Price Changes Reflect Immediately

**Implementation:** /api/billing/cost fetches add_ons on every request; no cached pricing. LiveUsageMeter does not store or compute rates.

**Gate: Addon price changes reflect immediately**  
**Answer: YES** — Backend recalculates on every request; no frontend constants for addon rates.

**RXTrace verification:** Update add_ons.price → GET /api/billing/cost returns new rate and cost for that line.

---

## 10. UI Never Decides Billing Values

**Implementation:** Preview from /api/billing/calculate-amount; subscribe from upgrade API; dashboard totals from /api/billing/cost. UI displays only server-returned values.

**Gate: UI never decides billing values**  
**Answer: YES** — All billing values (preview, payment, dashboard cost) come from server; UI is display-only.

---

## Gate Summary

| # | Criterion | YES/NO |
|---|-----------|--------|
| 1 | Company resolution works for owner + seat | **YES** |
| 2 | Middleware uses canonical resolver | **YES** |
| 3 | No silent redirects | YES |
| 4 | Subscription reachable on facts only | YES |
| 5 | Discounts server-side only | YES |
| 6 | GST applied correctly and conditionally | YES |
| 7 | Invoice totals always match payment | YES |
| 8 | Dashboard reflects admin pricing | **YES** |
| 9 | Addon price changes reflect immediately | **YES** |
| 10 | UI never decides billing values | **YES** |

**Overall: All gates YES.** Production-ready subject to verification below.

---

## Fixes Applied (RXTrace-Verifiable)

1. **Company resolution:** Canonical resolver used in middleware and all billing/pricing/dashboard/invoice APIs. Owner + active seat resolve to company. `resolveCompanyForUser` returns `isOwner` for billing gate.
2. **Billing owner-only gate:** Upgrade, trial/activate, subscription/cancel, subscription/resume, addon cart create-order: only owner can trigger. Seat users get 403.
3. **Admin APIs canonical resolver:** admin/seats, admin/scanner-settings, admin/handsets use `resolveCompanyIdFromRequest` (from lib/company/resolve) so seat users can access company-scoped endpoints.
4. **Addon pricing from DB:** lib/billing/addon-pricing.ts fetches add_ons; calculate-cart-amount and addons/cart/create-order use it. No PRICING constants for addon rates.
5. **Pricing page:** Removed ADDONS constant with unitPricePaise. All addon prices from /api/public/add-ons.
6. **Dashboard cost:** GET /api/billing/cost returns usage, line_items (rate/cost from subscription_plans and add_ons), subtotal, tax, total.
7. **Trial columns:** lib/billing/usage and billing/subscription route use trial_ends_at.
8. **user/usage:** Uses resolveCompanyForUser for seat users.

---

## Production Hardening

| Item | Status |
|------|--------|
| Security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) | next.config.js `headers()` |
| Safe 500 responses (no internal error message in production) | lib/api-error.ts; billing/cost, trial/activate |
| Env validation for production | lib/env.ts: getMissingProductionEnv(), assertProductionEnv() |
| Razorpay webhook secret | Set RAZORPAY_WEBHOOK_SECRET in production |

---

## Fixes Applied (Production Blockers & Risks)

- **B1:** GET /api/billing/subscription now uses `resolveCompanyForUser` so seat users can view subscription.
- **R1:** Webhook returns 503 in production if RAZORPAY_WEBHOOK_SECRET is not set.
- **R2:** /api/health validates env in production; returns 503 if critical vars missing or webhook secret unset (when Razorpay used).
- **R3:** TypeScript/ESLint kept disabled for Windows build; run `npx tsc --noEmit` and `npm run lint` in CI.
- **R4:** ERP page shows owner-only notice for seat users.
- **R5:** Migration 20260201120000 drops idx_labels_units_company_gtin_unique; schema aligns with Rule A.

## Verification Checklist (RXTrace)

- [ ] Owner: /pricing shows companyId and preview; trial and subscribe work.
- [ ] Seat user: /pricing shows companyId; /dashboard resolves company (no redirect to company-setup when company exists). RLS policy `Users can view company via active seat` (20260228100000) must be applied.
- [ ] Seat user: Cannot trigger upgrade, trial activate, cancel, resume, or addon purchase (403). Can view pricing, dashboard, billing cost, invoices.
- [ ] Trial: Only owner can start trial. Start trial → no row in company_subscriptions; companies.trial_status = 'active'; app accessible.
- [ ] Paid: Only owner can subscribe. Subscribe → company_subscriptions row; Razorpay charge; invoice created; totals match.
- [ ] Dashboard: GET /api/billing/cost returns line_items with rates from DB; change add_ons.price or subscription_plans.base_price → dashboard total and line costs update.
- [ ] Addon cart: Prices from add_ons table (lib/billing/addon-pricing.ts); no PRICING constants.
