# Billing Production Blocker Audit (Factual)

**Objective:** Full factual audit of company resolution, subscription, trial, discounts, coupons, tax, invoice, and UI calculations. No fixes. No assumptions. No production-readiness claims.

---

## 1. Company Resolution (CRITICAL)

### How companyId is resolved

- **Everywhere in app code:** `companies` table is queried with `.eq('user_id', user.id)` (or `session.user.id`). Only one row can match; that row’s `id` is used as `companyId`.
- **No other resolution path:** There is no fallback via `seats` or any other table. RLS defines policies using `seats` for some access, but **application code never resolves company by seat membership**; it only uses `companies.user_id`.

### Exact failure conditions (company exists but system treats as missing)

| # | Condition | Where it happens | Why it blocks production |
|---|-----------|-------------------|---------------------------|
| 1 | User is not the company owner | Any API or page that uses `companies.eq('user_id', user.id)`: pricing, upgrade, calculate-amount, user/subscription, middleware, signin, validate-coupon, issues, etc. | If a company has multiple users (e.g. via seats), only the user whose id equals `companies.user_id` gets a company. All other users get "company not found" or redirect to company-setup even though a company exists for them (via seat). |
| 2 | Company fetch fails or returns null | Pricing page: `setCompanyId((company as any)?.id ?? null)`. If the useEffect fetch errors, the catch block is empty (`catch { ignore }`), so state is never set. | User can land on pricing with `companyId === null`. Clicking Subscribe triggers `if (!companyId)` → redirect to company-setup. Company may exist; user is still sent to setup. |
| 3 | Company exists but `profile_completed === false` | Middleware (dashboard): `if (company.profile_completed === false)` → redirect to `/dashboard/company-setup`. | Company exists and is resolved, but user is **silently redirected** to company-setup on every dashboard visit until profile is completed. No explicit "complete profile" gate; redirect is silent. |

### Silent redirects and fallback logic

| Location | Trigger | Redirect target |
|----------|---------|-----------------|
| `middleware.ts` | No session on dashboard/regulator | `/auth/signin` |
| `middleware.ts` | No company row for `user_id` | `/dashboard/company-setup` |
| `middleware.ts` | Company exists but `profile_completed === false` (except ERP page) | `/dashboard/company-setup` |
| `middleware.ts` | Company exists but `subscription_status` not in trial/active/paid/live | `/pricing` |
| `auth/signin/page.tsx` | No company row after sign-in | `/dashboard/company-setup` |
| `auth/signin/page.tsx` | Company exists but no allowed subscription_status | `/pricing` |
| `pricing/page.tsx` | `!companyId` in startFreeTrial | `/dashboard/company-setup` |
| `pricing/page.tsx` | `!companyId` in subscribeToPlan | `/dashboard/company-setup` |
| `pricing/page.tsx` | `company?.subscription_status` truthy when starting trial | `/dashboard/billing` |
| `dashboard/packing-rules/page.tsx` | No company from client fetch | `router.push('/dashboard/company-setup')` |

**Conclusion (1):** Company is **not** deterministically resolved for every authenticated user. It is resolved only for the single user who is `companies.user_id`. All other users of the same company get "company not found" or redirects. Silent redirects exist (middleware profile_completed; pricing empty catch). **NOT production ready** for multi-user-per-company.

---

## 2. Subscription Flow (End-to-End)

### Trace: pricing → payment → activation

1. **Pricing page:** User selects plan; clicks Subscribe. `subscribeToPlan(plan)` runs.
2. **Client guard:** `if (!companyId)` → redirect to company-setup (no API call).
3. **API:** `POST /api/billing/subscription/upgrade` with plan, billing_cycle, optional coupon_code. Server resolves company by `user_id`; if no company → 404 "Company not found". Creates/updates Razorpay subscription; returns `subscription.id`, `subscription.short_url`.
4. **Client:** If `subscriptionData.short_url` → `window.location.href = subscriptionData.short_url` (redirect to Razorpay). Else if `subscriptionData.id` → opens Razorpay Checkout modal (subscription_id).
5. **Webhook:** Razorpay sends `subscription.charged` / `invoice.paid` etc. Invoice is created only when `eventType === 'invoice.paid' || status === 'paid'`. Company for invoice is resolved from `invoice.notes.company_id` or `companies.razorpay_subscription_id`.

### Broken or missing subscription invariants

| # | Issue | Exact failure condition | Why it blocks production |
|---|--------|---------------------------|---------------------------|
| 1 | Upgrade API never receives GST from company | `app/api/billing/subscription/upgrade/route.ts`: company select is `'id, discount_type, discount_value, discount_applies_to, razorpay_subscription_id, razorpay_offer_id'`. It does **not** select `gst_number`. Code uses `(company as any)?.gst_number` which is always undefined. | GST is never applied to subscription addons at Razorpay. Preview (calculate-amount) also omits GST (see Tax section). User may be charged without GST even when GST is required, or UI and invoice can diverge. |
| 2 | Plan not found / inactive | Upgrade and calculate-amount both require a row in `subscription_plans` for (name, billing_cycle, is_active). If plan is missing or inactive, API returns 404. | If `subscription_plans` is not populated or naming/cycle mismatch (e.g. "annual" vs "yearly"), subscription creation fails. No invariant documented or enforced. |
| 3 | Company not found on upgrade | Upgrade uses `companies.eq('user_id', user.id)`. If no row (e.g. invited user), 404. | Same as company resolution: non-owner users cannot subscribe. |
| 4 | short_url optional | Client checks `subscriptionData.short_url` then `subscriptionData.id`. If Razorpay returns neither, user sees "Payment link not available". | Edge case; no retry or fallback. |

**Conclusion (2):** Subscription flow depends on company resolution (user_id only). GST is not applied in upgrade (and in preview) because `gst_number` is not selected. Plan data and naming must match exactly. **NOT production ready** without fixing company resolution and GST/tax selection.

---

## 3. Trial Flow

### Trial creation, duration, expiry, state

- **Activation:** `POST /api/trial/activate` expects `company_id`. Company is resolved again by `user_id`; trial state is written only to `companies` (`trial_started_at`, `trial_ends_at`, `trial_status`, `subscription_status = 'trial'`). No row in `company_subscriptions`.
- **User subscription API:** First reads `company_subscriptions` for paid subscription; if none, then reads `companies.trial_status` and `trial_ends_at` and builds a synthetic trial object. Trial expiry updates `companies.trial_status = 'expired'`, `subscription_status = 'expired'`.
- **Pricing page:** Trial eligible = `companyId && !company?.subscription_status`. Subscribe button does not check trial; it only checks `companyId`.

### Incorrect dependencies or state overlap

| # | Issue | Exact condition | Why it blocks production |
|---|--------|------------------|---------------------------|
| 1 | Trial not used as proof of company existence | Trial is stored on company; company is still resolved only by `user_id`. So trial does not "create" or "prove" company for a different user. | No state overlap: trial and subscription are separate. But company resolution remains single-user. |
| 2 | Trial does not block paid subscription | Code allows subscribe during trial (no check that subscription_status === 'trial' blocks upgrade). | By design; no incorrect dependency. |
| 3 | Settings page still references old trial shape | `app/dashboard/settings/page.tsx` uses `subscription?.trial_end`, `subscription.status === 'TRIAL' || subscription.status === 'trialing'`. User subscription API returns synthetic trial with `status: 'trialing'` and `trial_end: trialEndsAt`. | If synthetic object shape diverges from what settings expects, UI can break. Not verified end-to-end. |

**Conclusion (3):** Trial and paid subscription are decoupled in backend. No trial-based block on subscription. Remaining risk is company resolution (same as §1) and possible UI assumptions on subscription/trial shape.

---

## 4. Discounts & Pricing Logic (CRITICAL)

### A. Coupon logic

- **Creation:** Admin creates discount in `discounts` (code, type, value, validity, usage_limit, razorpay_offer_id). Assignment to company via `company_discounts`.
- **Validation:** `POST /api/billing/validate-coupon` and inline in calculate-amount and upgrade: coupon must be in `discounts`, active, within valid_from/valid_to, usage_count < usage_limit, and assigned to company (`company_discounts`). Single coupon per request (one code).
- **Application timing:** In calculate-amount and upgrade: company discount applied first (server-side `calculateFinalAmount`), then coupon discount applied to `amountAfterDiscount` (server-side). Tax (GST) applied after discount (when gst_number is present; see §5).
- **Razorpay:** Discount at gateway is via single `offer_id` (coupon’s `razorpay_offer_id` or company’s `razorpay_offer_id`). No negative addons for discount.

### B. Company-level discount

- **Precedence:** In upgrade, `offer_id` is resolved: if coupon code provided and valid, use coupon’s `razorpay_offer_id`; else if company has discount and applies to subscription, use company’s `razorpay_offer_id`. One offer only.
- **Conflict / double discount:** Only one `offer_id` is sent to Razorpay. No double-discount at gateway. Preview (calculate-amount) applies company discount then coupon to same base; both are server-side.

### Discount-related production blockers

| # | Issue | Exact condition | Why it blocks production |
|---|--------|------------------|---------------------------|
| 1 | calculate-amount company select omits gst_number | See §5. Preview discount/tax breakdown can be wrong (no GST in preview). | UI "You pay" can mismatch Razorpay if GST is applied at gateway but not in preview (because gst_number not loaded). |
| 2 | Expired / reused coupon | Validation checks valid_to and usage_count. If coupon expires or hits limit after preview but before upgrade, upgrade may still send same offer_id if validation is not re-done with same rules. | Upgrade re-validates coupon; if invalid, offer_id from coupon is not set. Company offer_id can still apply. No double-use of coupon count verified in same request. |
| 3 | Client display vs server | Pricing page shows "You pay" from `previewByPlan` (API). Card strikethrough price uses client `calculateDiscountedPrice(monthly.base_price, companyDiscount)` for display only. | Display-only client calc can diverge from server (e.g. if company discount shape differs). Not used for charge. |

**Conclusion (4):** Single coupon, precedence (coupon then company), and server-side application are consistent. Main blocker is GST not being selected in calculate-amount (and upgrade), so preview and actual charge can diverge when GST applies.

---

## 5. Tax Calculation Logic (GST – CRITICAL)

### Where tax is calculated

- **Server:** `lib/billing/tax.ts` `calculateFinalAmount` and `calculateTax`: GST applied only when `gstNumber` is non-empty. Rate from `PRICING.TAX_RATE` (e.g. 0.18). Order: base → discount → tax.
- **Used by:** `app/api/billing/calculate-amount/route.ts`, `app/api/billing/subscription/upgrade/route.ts`, and webhook invoice breakdown logic.

### Exact bugs

| # | Issue | Exact condition | Why it blocks production |
|---|--------|------------------|---------------------------|
| 1 | GST never applied in calculate-amount | `calculate-amount` selects company with `'id, discount_type, discount_value, discount_applies_to'`. It does **not** select `gst_number` (or `gst`). Later: `const gstNumber = (company as any)?.gst ?? (company as any)?.gst_number ?? null` → always null. So `finalCalc.hasGST` is false and tax is 0. | Preview "You pay" and breakdown never include GST. If company has GST, Razorpay charge will include tax but UI will not. **Mismatch between UI and invoice totals.** |
| 2 | GST never applied in upgrade (addons) | Upgrade selects company with same list (no gst_number). So `gstNumber` is null, `finalCalc.hasGST` false, and the addons sent to Razorpay do not include a GST line. | Subscription amount at Razorpay may not include GST even when company is GST-registered. **Incorrect tax application.** |
| 3 | Invoice storage | Webhook creates invoice with amount from Razorpay (post-discount, post-tax). Tax/discount fields on invoice are populated from webhook/company data. | Invoice amount is correct (Razorpay is source). But if Razorpay never got GST because upgrade didn’t send it (§2), invoice amount may still be wrong (no tax). |

**Conclusion (5):** Tax is designed to be server-side only, but the two critical routes (calculate-amount and subscription/upgrade) **do not load `gst_number`** from the company. So GST is **never** applied in preview or in subscription creation. **NOT production ready** for GST-registered companies.

---

## 6. Invoice Generation Flow (CRITICAL)

### When invoice is created

- **Subscription invoice:** In Razorpay webhook, on `subscription.invoice.paid` (or invoice entity with `status === 'paid'`). Code: `const isPaidEvent = eventType === 'invoice.paid' || status === 'paid'; if (!isPaidEvent) return ... ignored`. So **invoice is created only after payment confirmation** (paid event).
- **Addon invoice:** Same pattern: invoice created when processing paid addon order.

### Links and contents

- Invoice is linked to: company_id (from notes or companies.razorpay_subscription_id), reference (e.g. razorpay_invoice:{id}), provider_invoice_id, provider payment_id. Subscription invoice links to subscription via company and Razorpay subscription_id.
- Invoice captures: amount (from Razorpay, in INR), tax/discount fields when available, period, plan label.

### Invoice generation blockers

| # | Issue | Exact condition | Why it blocks production |
|---|--------|------------------|---------------------------|
| 1 | Company not found for webhook | companyId from invoice.notes.company_id or companies.razorpay_subscription_id. If both missing (e.g. notes not set, or subscription_id not yet on company), webhook returns `ignored: true, reason: 'company_not_found'`. | Invoice is not stored; payment succeeded at Razorpay but no record in app. **Missing link between payment and company.** |
| 2 | Upgrade must set notes.company_id | If upgrade does not pass company_id in Razorpay subscription notes, webhook may rely only on companies.razorpay_subscription_id. If that is set only after subscription creation, race possible. | Not verified that every subscription create/update sends company_id in notes. |
| 3 | Duplicate / mismatch handling | Webhook checks existing invoice by company_id + reference; duplicate amount mismatch is logged. Insert may still fail on unique constraint in edge cases. | Documented; no silent overwrite. |

**Conclusion (6):** Invoice is created only after payment (paid event). Main blocker: company resolution in webhook (notes or razorpay_subscription_id); if both fail, invoice is dropped. **NOT production ready** without guaranteeing company_id in notes and/or reliable razorpay_subscription_id on company.

---

## 7. Desktop / UI Calculation Validation

### Backend vs UI

- **Preview "You pay":** Comes from `GET /api/billing/calculate-amount` → `previewByPlan` → `youPayPreview.finalAmount` and `breakdown`. So **backend** drives the displayed "You pay" and breakdown.
- **Card price (strikethrough):** Uses client `calculateDiscountedPrice(base_price, companyDiscount)` for display only. Not used for charge.
- **Subscribe:** No client-side amount used; upgrade API and Razorpay determine charge.

### Calculation integrity issues

| # | Issue | Exact condition | Why it blocks production |
|---|--------|------------------|---------------------------|
| 1 | Backend preview omits GST | Because calculate-amount does not select gst_number (§5), preview finalAmount and breakdown never include tax. | **UI and invoice totals can mismatch** when company has GST. |
| 2 | Client discount display | `calculateDiscountedPrice` uses companyDiscount (from API). If company discount or shape differs from server, strikethrough can differ from server breakdown. | Cosmetic mismatch; not used for billing. |
| 3 | Rounding | Server uses `Number((x).toFixed(2))` in tax and final amount. Razorpay uses its own rounding. | Small rounding differences possible between preview and final invoice. |

**Conclusion (7):** UI does not trust client for the final "You pay" (it uses backend preview). But backend preview is wrong when GST applies (missing gst_number). So **UI and invoice totals can mismatch**. **NOT production ready** until preview and upgrade both use company gst_number.

---

## 8. Production Readiness Gate (NON-NEGOTIABLE)

| # | Criterion | Answer | Evidence |
|---|-----------|--------|----------|
| 1 | No silent redirects | **NO** | Middleware redirects to company-setup when profile_completed === false without user-visible reason. Pricing page can redirect to company-setup when companyId is null (e.g. after silent fetch failure). |
| 2 | No nullable company state for logged-in users | **NO** | Company is null for any logged-in user who is not companies.user_id (e.g. invited/seat users). Multiple users per company is not supported by resolution. |
| 3 | No client-side entitlement decisions | **YES** | Subscribe/upgrade and preview use server APIs. Client only checks companyId (which is server-derived data); no client-only entitlement. |
| 4 | No invoice without payment confirmation | **YES** | Webhook creates subscription/addon invoice only when isPaidEvent (invoice.paid or status paid). |
| 5 | No discount or tax calculation on client for billing | **YES** | Discount and tax for billing are in server (calculate-amount, upgrade, webhook). Client calculateDiscountedPrice is display-only. |
| 6 | No mismatch between UI and invoice totals | **NO** | UI preview excludes GST (calculate-amount omits gst_number). Upgrade also omits GST. So UI can show lower than Razorpay/invoice when GST applies, or Razorpay may not add GST because upgrade didn’t send it. |

**Overall:** At least two criteria fail (silent redirects; nullable company for non-owner users; UI/invoice mismatch due to missing GST). **NOT production ready.**

---

## Summary Table: Exact Failure Conditions and Blockers

| Area | Exact failure condition | Why it blocks production |
|------|-------------------------|---------------------------|
| Company resolution | Resolution only by `companies.user_id`. No fallback for seat members. | Non-owner users always get "company not found" or redirect to company-setup. |
| Company resolution | Fetch error or null in pricing page useEffect; catch is empty. | companyId stays null; Subscribe redirects to company-setup. |
| Company resolution | Middleware: company exists but profile_completed === false. | Silent redirect to company-setup on every dashboard visit. |
| Subscription | Upgrade (and calculate-amount) do not select company gst_number. | GST never applied in preview or in Razorpay subscription; UI/invoice can diverge; possible compliance risk. |
| Tax | Same as above: gst_number not in company select in calculate-amount and upgrade. | Tax never applied server-side for preview or subscription; mismatch with invoice when GST applies. |
| Invoice | Webhook companyId from notes or razorpay_subscription_id; if both missing, invoice ignored. | Paid event not recorded; missing link between payment and company. |
| UI vs backend | Preview is backend-driven but backend omits GST. | "You pay" can be wrong and can differ from final invoice. |

---

**Document rule:** No assumptions, no speculative language, no fix claims. Only: issue, exact failure condition, why it blocks production.
