# Phase-Wise Implementation Plan

This document outlines a phased approach to implement the Razorpay coupon/discount fix and related billing consistency. Phases are ordered by dependency; complete each before starting the next.

---

## Overview

| Phase | Name | Scope | Dependency |
|-------|------|--------|------------|
| **1** | Razorpay offers (manual) | Create offers in Razorpay Dashboard | None |
| **2** | Schema | Add `razorpay_offer_id` to discounts (and optionally companies) | Phase 1 (need offer IDs) |
| **3** | Subscription upgrade API | Resolve `offer_id`, pass to Razorpay; remove discount/coupon from addons | Phase 2 |
| **4** | Calculate-amount & preview | Ensure preview matches Razorpay (no code change if already aligned) | Phase 3 |
| **5** | Webhook & billing UI | Verify discounted amount flows through (no code change) | Phase 3 |
| **6** | Verification & docs | Test matrix, update runbooks | Phase 5 |

**Out of scope in this plan:** Add-on cart discount via Razorpay (separate plan); trial/subscription model fixes (already done).

---

## Phase 1: Razorpay Dashboard — Create Offers

**Objective:** Create Razorpay offers so subscription creation can use `offer_id`. Razorpay does not expose a “Create Offer” API; offers are created only in the Dashboard.

**Deliverables:**
- One Razorpay offer per discount type you use (e.g. 10% off, 20% off, flat ₹X off).
- Optional: company-level offers (e.g. “Company 10%”, “Company 20%”) if you assign company discounts.
- A list of **Offer IDs** (e.g. `offer_JHD834hjbxzhd38d`) for use in Phase 2.

**Steps:**
1. Log in to **Razorpay Dashboard** → **Subscriptions** → **Offers** (or equivalent).
2. Create offers that match your RxTrace discount types:
   - Percentage: e.g. 10% off, 20% off (match `discounts.type = 'percentage'` and `value`).
   - Flat: e.g. ₹500 off, ₹1000 off (match `discounts.type = 'flat'` and `value`).
3. If you use **company-level discounts** (`companies.discount_type`, `discount_value`), create offers that match those (e.g. “Company 10%”, “Company 15%”).
4. Document each **Offer ID** in a secure place (e.g. env checklist or internal doc).

**Verification:**
- You have at least one offer per coupon/discount type used in production.
- Offer IDs are recorded for Phase 2.

**Dependencies:** None.

---

## Phase 2: Schema — Store Razorpay Offer IDs

**Objective:** Persist Razorpay offer IDs in RxTrace so the subscription upgrade API can pass `offer_id` to Razorpay.

**Deliverables:**
- Migration adding `razorpay_offer_id` to `discounts`.
- Optional: `razorpay_offer_id` on `companies` or a small mapping table for company-level discounts.
- Data backfill: set `razorpay_offer_id` for existing coupons (and companies) that should apply at checkout.

**Steps:**
1. **Migration: `discounts`**
   - Add column: `razorpay_offer_id TEXT NULL`.
   - No unique constraint (multiple coupons can map to the same offer if they have same %/flat).
2. **Migration (optional): company-level discount**
   - Option A: Add `companies.razorpay_offer_id TEXT NULL`.
   - Option B: Create a mapping table, e.g. `discount_offer_mapping (discount_type, discount_value, razorpay_offer_id)` and resolve by `companies.discount_type` + `discount_value`.
3. **Backfill**
   - For each active coupon in `discounts` that should apply to subscriptions: set `razorpay_offer_id` to the Razorpay offer ID from Phase 1 that matches type/value.
   - If using Option A for companies: for each company with `discount_type`/`discount_value`, set `razorpay_offer_id` to the matching offer ID.

**Verification:**
- Migration runs successfully (local + staging).
- At least one coupon used in tests has `razorpay_offer_id` set.
- Companies with subscription discount (if Option A) have `razorpay_offer_id` set where applicable.

**Dependencies:** Phase 1 (offer IDs must exist).

---

## Phase 3: Subscription Upgrade API — Use `offer_id`, Drop Discount Addons

**Objective:** When creating a subscription, pass Razorpay `offer_id` instead of sending discount/coupon as negative addons. Send only GST as a positive addon.

**File:** `app/api/billing/subscription/upgrade/route.ts`

**Deliverables:**
- Resolve `offer_id` from coupon code or company discount.
- Call `razorpay.subscriptions.create(…, offer_id, addons)` with addons containing **only** GST (no discount/coupon addons).
- Coupon validation and usage_count update unchanged; only the way discount is sent to Razorpay changes.

**Steps:**
1. **Resolve `offer_id`:**
   - If request has `coupon_code`: validate coupon (existing logic: `discounts` + `company_discounts`, validity, usage_limit). If valid, read `discounts.razorpay_offer_id`; if not null, use as `offer_id`.
   - Else if company has subscription discount (`discount_type`, `discount_value`, `discount_applies_to` includes subscription): get `offer_id` from `companies.razorpay_offer_id` or from mapping (Phase 2 Option B).
   - If both coupon and company discount apply, decide policy: e.g. use coupon `offer_id` only (one offer per subscription in Razorpay), or use a single combined offer created in Phase 1.
2. **Build addons:**
   - Remove any addon that represents “Discount” or “Coupon”.
   - Keep only **GST (18%)** as positive addon when company has GST (same as current logic).
3. **Razorpay call:**
   - `razorpay.subscriptions.create({ plan_id, total_count, customer_notify, start_at, offer_id: offer_id ?? undefined, addons, notes })`.
4. **Leave unchanged:** plan resolution, company/subscription checks, trial_end_date, notes, coupon usage_count update.

**Verification:**
- Subscription with valid coupon: Razorpay checkout shows discounted amount; no negative addons.
- Subscription with company discount only: Razorpay shows discounted amount via `offer_id`.
- Subscription with no discount: no `offer_id`; full plan amount + GST addon if applicable.
- Existing behaviour (usage_count, notes, trial start) unchanged.

**Dependencies:** Phase 2.

---

## Phase 4: Calculate-Amount / Preview

**Objective:** Ensure the “You pay” preview on the pricing page matches what Razorpay will charge (after offer).

**File:** `app/api/billing/calculate-amount/route.ts`

**Deliverables:**
- No change required if preview already uses the same discount/coupon logic as upgrade (same base price, company discount, coupon). Razorpay will apply the same offer, so amounts align.
- If you add new coupon types later: create matching offer in Razorpay (Phase 1) and set `discounts.razorpay_offer_id` (Phase 2).

**Steps:**
- Review calculate-amount: it should use company discount + coupon to compute final amount. If so, no code change.
- Optional: add a short comment in code that “Preview must match Razorpay offer; ensure razorpay_offer_id is set for all coupons used here.”

**Verification:**
- Preview amount for a given plan + coupon + company equals the amount charged by Razorpay after subscription creation.

**Dependencies:** Phase 3.

---

## Phase 5: Webhook & Billing Page

**Objective:** Confirm that Razorpay invoice events and billing UI show the discounted amount.

**Deliverables:**
- Webhook: no code change. Razorpay sends invoice with post-offer amount; existing logic that stores `amount` in `billing_invoices` remains correct.
- Billing page: no code change. It reads from `billing_invoices`; will show discounted amount automatically.

**Steps:**
- After Phase 3, run one test subscription with coupon and one with company discount.
- Confirm Razorpay webhook payload contains discounted amount.
- Confirm `billing_invoices` row has that amount and billing UI displays it.

**Verification:**
- Invoice created event (Razorpay) → `billing_invoices` amount = discounted amount.
- Billing page shows same amount. No change required unless you want to show “Offer/coupon applied” from Razorpay (would require storing offer info from webhook if Razorpay sends it).

**Dependencies:** Phase 3.

---

## Phase 6: Verification & Documentation

**Objective:** Lock down acceptance criteria and runbooks so future changes are safe.

**Deliverables:**
- Test matrix (subscription with coupon, with company discount, without discount; with/without GST).
- Update to `SUBSCRIPTION_TRIAL_VERIFICATION.md` or a dedicated “Billing verification” section: include coupon/offer checks.
- Optional: short runbook for “Adding a new coupon”: create offer in Razorpay → add/update coupon in RxTrace with `razorpay_offer_id`.

**Steps:**
1. Document test cases and run them (manual or automated) after Phase 3 deploy.
2. Update verification doc with coupon/offer verification steps.
3. If you use admin UI for coupons: add field/help text for `razorpay_offer_id` and document in runbook.

**Verification:**
- All test cases pass in staging.
- Docs are updated and reviewable.

**Dependencies:** Phase 5.

---

## Summary: Code & Config Touches

| Phase | Area | Action |
|-------|------|--------|
| 1 | Razorpay Dashboard | Create offers; record Offer IDs |
| 2 | Migrations | Add `razorpay_offer_id` to `discounts`; optionally to `companies` or mapping table; backfill |
| 3 | `app/api/billing/subscription/upgrade/route.ts` | Resolve `offer_id`; pass to Razorpay; addons = GST only |
| 4 | `app/api/billing/calculate-amount/route.ts` | No change (optional comment) |
| 5 | Webhook / Billing page | No change (verify only) |
| 6 | Docs / Tests | Test matrix; verification doc; runbook for new coupons |

---

## Constraints & Notes

- **One offer per subscription:** Razorpay accepts a single `offer_id` per subscription. If both company discount and coupon apply, use one (e.g. coupon wins) or a pre-created combined offer.
- **New coupons:** Create matching offer in Razorpay Dashboard, then set `discounts.razorpay_offer_id` in RxTrace (admin or migration).
- **Tax:** Keep current behaviour: GST calculated in RxTrace and sent as positive addon when company has GST. Do not send discount/coupon as addons.
- **Add-on cart:** Discount for add-on orders is out of scope; handle in a separate plan (e.g. Payment Links with offer or order-level discount).

---

## Suggested Timeline (High Level)

| Phase | Suggested duration | Notes |
|-------|--------------------|--------|
| 1 | 0.5 day | Manual; depends on number of offer types |
| 2 | 0.5–1 day | Migration + backfill |
| 3 | 1–2 days | Core logic + tests |
| 4 | ~0.5 day | Review only |
| 5 | ~0.5 day | Verify webhook + UI |
| 6 | 0.5–1 day | Docs + test matrix |

Total: about **4–6 days** for one developer, assuming no surprises in Razorpay Dashboard or existing billing code.
