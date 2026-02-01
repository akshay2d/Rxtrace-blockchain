# Production Ready Fix Plan

**Purpose:** Concrete fixes for the blockers in `BILLING_PRODUCTION_BLOCKER_AUDIT.md`, plus questions you must answer and a checklist to run before launch. No assumptions. No claim that “after this you are production ready” — only that these fixes address the **audited** blockers; you must run the checklist and your own tests.

---

## Questions for you (must answer)

These affect what else needs to be done. Please answer so nothing is assumed.

### 1. Multiple users per company (seats / invited users)

- **Current behaviour:** Company is resolved **only** by `companies.user_id`. Only the user whose id equals that column gets a company. Any other user of the same company (e.g. via seats) gets “company not found” or redirect to company-setup.
- **Question:** Do you have (or will you have) **multiple users per company** (invited users / seats)?  
  - If **yes:** We need to add a fallback: resolve company by `companies.user_id` first; if no row, resolve by `seats` (user in seats → that company_id). This touches: pricing, upgrade, calculate-amount, user/subscription, middleware, signin, validate-coupon, and any other route that uses `companies.eq('user_id', user.id)`.  
  - If **no** (only one user per company, the “owner”): No change to company resolution; the fixes below are enough for that model.

### 2. “Lock the code so no more bugs”

- **Question:** What do you mean by “lock the code”?  
  - **A)** Branch protection (e.g. no direct push to main; PR + review required)?  
  - **B)** A written checklist that must be run before every release (no deploy without running it)?  
  - **C)** Something else (please specify)?

### 3. GST column name on `companies`

- **Current state:** Migrations define `companies.gst` (TEXT). Code was updated to select `gst` in calculate-amount and upgrade. If your **live** DB has a different column (e.g. `gst_number` on companies), tell me and we align the select.

### 4. Subscription plans in DB

- **Current state:** Upgrade and calculate-amount require a row in `subscription_plans` for (name, billing_cycle, is_active). Plan name is normalized (Starter, Growth, Enterprise); cycle is `monthly` or `yearly`.  
- **Question:** Are `subscription_plans` and Razorpay plans already created and IDs stored in DB (and in `lib/razorpay` or config)? If not, that is **outside code** — you need to create plans in Razorpay and in the DB; I can list exact columns and steps.

---

## Fixes already done (this session)

| # | What | Where | Verification |
|---|-----|--------|---------------|
| 1 | **GST in preview and upgrade** | `app/api/billing/calculate-amount/route.ts`: company select now includes `gst`. `app/api/billing/subscription/upgrade/route.ts`: company select now includes `gst`. | Call calculate-amount with a company that has `gst` set; response must have `hasGST: true` and non-zero `taxAmount`. Create subscription for same company; Razorpay subscription must include GST addon when gst is set. |
| 2 | **Pricing page: no silent company fetch failure** | `app/pricing/page.tsx`: Added `companyLoadError` state. In the useEffect that loads company, catch block now sets `companyLoadError`, logs error, and sets `companyId`/`company` to null. UI shows banner: “Could not load company. Please refresh the page or complete company setup.” with link to company-setup. | Simulate failure (e.g. block network for that request); user must see the message and link, not a silent redirect. |
| 3 | **Profile redirect: reason param (no silent redirect)** | `app/middleware.ts`: When redirecting to company-setup because `profile_completed === false`, URL is now `/dashboard/company-setup?reason=complete_profile`. | With profile not completed, open any dashboard page; redirect URL must contain `reason=complete_profile`. |
| 4 | **Company-setup: show reason banner** | `app/dashboard/company-setup/page.tsx`: Uses `useSearchParams()`; when `reason=complete_profile` show Alert: “Please complete your company profile to access the dashboard.” | Land on company-setup with `?reason=complete_profile`; banner must be visible. |

---

## Fixes not done (depend on your answers or are non-code)

| # | What | Blocked by / Note |
|---|-----|--------------------|
| 1 | **Company resolution for multiple users (seats)** | Your answer to Question 1. If you need multi-user, a shared helper (e.g. `resolveCompanyIdForUser(userId)`: try companies.user_id, then seats) and then use it everywhere company is resolved. |
| 2 | **Branch protection / “lock code”** | Your answer to Question 2. If A: configure in GitHub/GitLab. If B: use the checklist below and enforce in your process. |
| 3 | **Subscription plans and Razorpay plan IDs** | Your answer to Question 4. If not done: create plans in Razorpay Dashboard, insert rows in `subscription_plans`, ensure `lib/razorpay` (or config) maps plan name + cycle to correct Razorpay plan ID. |
| 4 | **Webhook company resolution** | Upgrade already sends `company_id` in Razorpay subscription notes. Webhook uses `invoice.notes.company_id` or `companies.razorpay_subscription_id`. Ensure `companies.razorpay_subscription_id` is updated after subscription create (code already does this). No change needed unless you see “company_not_found” in webhook logs. |

---

## Production readiness checklist (run before launch)

Do **not** deploy until every item is done and verified. Any **NO** = do not consider production ready.

| # | Item | How to verify | YES/NO |
|---|------|----------------|--------|
| 1 | Company resolution | Log in as the user who is `companies.user_id` for a company. Open pricing, subscribe, upgrade — must get company and redirect to Razorpay. | |
| 2 | Company resolution (if multi-user) | If you use seats: log in as an **invited** user (not owner). Pricing and subscribe must still resolve company and work (after implementing seat fallback). | |
| 3 | GST in preview | Company has `gst` set. Call `/api/billing/calculate-amount` with that user’s session; response has `hasGST: true`, `taxAmount` > 0, `finalAmount` = subtotal + tax. | |
| 4 | GST in subscription | Same company with `gst` set. Create subscription via UI; in Razorpay Dashboard the subscription must show GST addon (or post-offer amount including tax). | |
| 5 | No silent redirects | Trigger: company exists but `profile_completed === false`. Visit dashboard → redirect to company-setup **with** `?reason=complete_profile` and company-setup shows “Please complete your company profile…”. | |
| 6 | Company fetch error on pricing | If company fetch fails (or returns null), pricing page shows “Could not load company…” and link to company-setup; no silent redirect. | |
| 7 | Invoice only after payment | In Razorpay, trigger only `subscription.invoice.created` (not paid). Check DB: no new row in `billing_invoices` for that invoice. Then mark paid; webhook `invoice.paid` → row must appear. | |
| 8 | Subscription notes | After creating a subscription, in Razorpay subscription notes must include `company_id` (your company UUID). So webhook can resolve company. | |
| 9 | Plans in DB and Razorpay | `subscription_plans` has rows for every plan + cycle you offer. Razorpay has matching plans. Upgrade uses correct plan ID (no “plan not found” for valid selection). | |
| 10 | Coupon / company offer | Create coupon with `razorpay_offer_id` in admin. Assign to company. At checkout use coupon → Razorpay must show discounted amount. Company discount with `razorpay_offer_id` → same. | |

---

## What to do next

1. **Answer the questions** in “Questions for you” above.  
2. **If multi-user:** I will add a `resolveCompanyIdForUser` (or equivalent) and switch all billing/auth company resolution to use it.  
3. **Run the checklist** before launch; fix any NO.  
4. **“Lock the code”:** After you define what you want (branch protection vs checklist vs other), we can document it (e.g. in this file or in a CONTRIBUTING/RELEASE.md).

I will not assume multi-user, column names, or that plans are ready. Once you answer, remaining code changes can be done and re-checked against this plan.
